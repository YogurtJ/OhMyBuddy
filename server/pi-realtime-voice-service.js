'use strict';

const { createHash } = require('node:crypto');
const WebSocket = require('ws');
const { endpoint, authHeaders } = require('./media-http-protocol');
const { proxyAgent } = require('./workspace-network-transport');

const MAX_SESSIONS = 2;
const MAX_DURATION_MS = 10 * 60_000;
const MAX_AUDIO_CHUNK_CHARS = 131072; // ~96 KiB PCM per frame (up to 3s of 16kHz 16-bit mono)
const MAX_TEXT_CHARS = 8000;
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const VALID_TURN_MODES = new Set(['smart_turn_v2', 'smart_turn', 'server_vad', 'push_to_talk']);
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };

function qwenRealtimeProviderHost(url) {
    return url.protocol === 'https:' && (url.hostname === 'dashscope.aliyuncs.com' || url.hostname === 'dashscope-intl.aliyuncs.com'
        || url.hostname === 'token-plan.maas.qianwenaiapi.com' || /^[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/i.test(url.hostname));
}

function realtimeModels(models, available) {
    const configured = new Set(available.map(model => model.provider));
    const found = new Map();
    for (const model of models) {
        if (!configured.has(model.provider)) continue;
        let url;
        try { url = new URL(model.baseUrl); } catch { continue; }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) continue;
        if (!qwenRealtimeProviderHost(url)) continue;
        const remoteModel = /^qwen-audio-\d+\.\d+-realtime-(?:plus|flash)$/i.test(model.id) ? model.id : 'qwen-audio-3.0-realtime-plus';
        const id = JSON.stringify([model.provider, remoteModel]);
        found.set(id, {
            id, provider: model.provider, modelId: remoteModel,
            name: `${model.provider} / ${remoteModel}`,
            protocol: 'qwen-realtime', baseUrl: url.origin,
            voice: /3\.1/.test(remoteModel) ? 'longanqian_v3.1' : 'longanqian',
            turnDetection: 'smart_turn_v2', speechRate: 1, enableSearch: false
        });
    }
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function realtimeWsUrl(baseUrl, remoteModel) {
    const base = new URL(baseUrl);
    if (/\/compatible-mode\/v1$/i.test(base.pathname)) base.pathname = base.pathname.replace(/\/compatible-mode\/v1$/i, '') || '/';
    const httpUrl = endpoint(base.href.replace(/\/+$/, ''), '/api-ws/v1/realtime');
    const wsUrl = new URL(httpUrl.href);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.searchParams.set('model', remoteModel);
    return { httpUrl, wsUrl };
}

function defaultVoiceForModel(remoteModel) {
    return /3\.1/.test(remoteModel) ? 'longanqian_v3.1' : 'longanqian';
}

function normalizeSessionOverrides(overrides = {}, model) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) fail('实时语音会话配置无效');
    for (const key of Object.keys(overrides)) {
        if (!['voice', 'turnDetection', 'instructions', 'speechRate', 'enableSearch'].includes(key)) fail('实时语音会话包含未知参数');
    }
    const voiceRaw = overrides.voice !== undefined ? overrides.voice : model.voice;
    if (voiceRaw !== undefined && typeof voiceRaw !== 'string') fail('实时语音音色 ID 无效');
    const voice = typeof voiceRaw === 'string' && voiceRaw.trim() ? voiceRaw.trim() : defaultVoiceForModel(model.modelId);
    if (voice.length > 200 || /[\r\n\0]/.test(voice)) fail('实时语音音色 ID 无效');
    const turnDetection = overrides.turnDetection !== undefined ? overrides.turnDetection : (model.turnDetection || 'smart_turn_v2');
    if (!VALID_TURN_MODES.has(turnDetection)) fail('实时语音轮次检测模式无效');
    const instructionsRaw = overrides.instructions !== undefined ? overrides.instructions : (model.instructions || '');
    if (typeof instructionsRaw !== 'string' || instructionsRaw.length > 4000 || /\0/.test(instructionsRaw)) fail('实时语音系统指令无效');
    const instructions = instructionsRaw.trim() || '你是自然、简明、友善的实时语音助手。请用清晰口语化的表达回答。';
    const rateRaw = overrides.speechRate !== undefined ? overrides.speechRate : (model.speechRate ?? 1);
    const speechRate = Number(rateRaw);
    if (!Number.isFinite(speechRate) || speechRate < 0.5 || speechRate > 2) fail('实时语音语速须在 0.5 到 2.0 之间');
    if (overrides.enableSearch !== undefined && typeof overrides.enableSearch !== 'boolean') fail('实时语音联网设置无效');
    const enableSearch = overrides.enableSearch !== undefined ? overrides.enableSearch : Boolean(model.enableSearch);
    return { voice, turnDetection, instructions, speechRate: Math.round(speechRate * 100) / 100, enableSearch };
}

function buildSessionUpdatePayload(config) {
    const turnDetection = config.turnDetection === 'push_to_talk' ? null
        : config.turnDetection === 'server_vad' ? { type: 'server_vad', threshold: 0.5, silence_duration_ms: 700 }
        : { type: config.turnDetection, threshold: 0.5 };
    return {
        type: 'session.update',
        session: {
            modalities: ['audio', 'text'],
            voice: config.voice,
            speech_rate: config.speechRate,
            instructions: config.instructions,
            input_audio_format: 'pcm',
            output_audio_format: 'pcm',
            enable_search: config.enableSearch,
            turn_detection: turnDetection
        }
    };
}

function base64PcmValid(value) {
    if (typeof value !== 'string' || !value || value.length > MAX_AUDIO_CHUNK_CHARS || value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) return false;
    const bytes = Buffer.from(value, 'base64');
    return bytes.length >= 2 && bytes.length % 2 === 0 && bytes.toString('base64') === value;
}

class PiRealtimeVoiceSession {
    constructor({ service, model, config, headers, httpUrl, wsUrl, createWebSocket, releaseProvider, emit, onDone }) {
        this.service = service;
        this.model = model;
        this.config = config;
        this.releaseProvider = releaseProvider;
        this.emit = emit;
        this.onDone = onDone;
        this.disposed = false;
        this.upstreamReady = false;
        this.sessionReady = false;
        this.upstream = null;
        this.readyResolve = null;
        this.readyReject = null;
        this.ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; });
        this.maxTimer = setTimeout(() => {
            this.emit({ type: 'gateway_realtime_voice_closed', reason: 'timeout', message: '单次实时语音通话已达到 10 分钟上限，连接已结束' });
            void this.dispose(1000, 'Session duration limit reached');
        }, service.maxDurationMs);
        this.maxTimer.unref?.();
        this.handshakeTimer = setTimeout(() => {
            this.failHandshake(Object.assign(new Error('连接实时语音服务超时；未重试'), { statusCode: 502 }));
            void this.dispose(1011, 'Upstream handshake timeout');
        }, service.handshakeTimeoutMs);
        this.handshakeTimer.unref?.();
        this.connect({ headers, httpUrl, wsUrl, createWebSocket });
    }

    failHandshake(error) {
        if (!this.sessionReady && this.readyReject) {
            const reject = this.readyReject;
            this.readyResolve = this.readyReject = null;
            reject(error);
        }
    }

    completeHandshake(sessionInfo) {
        if (!this.sessionReady && this.readyResolve) {
            this.sessionReady = true;
            clearTimeout(this.handshakeTimer);
            const resolve = this.readyResolve;
            this.readyResolve = this.readyReject = null;
            resolve({
                model: { id: this.model.id, provider: this.model.provider, modelId: this.model.modelId, name: this.model.name },
                config: this.config,
                inputSampleRate: 16000,
                outputSampleRate: 24000,
                maximumSeconds: Math.floor(this.service.maxDurationMs / 1000),
                upstreamSessionId: sessionInfo?.id || null
            });
        }
    }

    connect({ headers, httpUrl, wsUrl, createWebSocket }) {
        let ws;
        try {
            ws = createWebSocket(wsUrl.href, {
                headers,
                agent: proxyAgent(httpUrl, process.env),
                handshakeTimeout: this.service.handshakeTimeoutMs,
                maxPayload: MAX_UPSTREAM_BYTES,
                perMessageDeflate: false
            });
        } catch {
            this.failHandshake(Object.assign(new Error('无法连接实时语音服务'), { statusCode: 502 }));
            void this.dispose();
            return;
        }
        this.upstream = ws;
        ws.on('open', () => {
            if (this.disposed) { try { ws.close(1000); } catch {} return; }
            this.upstreamReady = true;
        });
        ws.on('unexpected-response', (_req, res) => {
            const status = res?.statusCode || 502;
            res?.resume?.();
            const message = status === 401 || status === 403
                ? '实时语音服务拒绝了当前 API Key（HTTP ' + status + '）'
                : `实时语音服务握手失败（HTTP ${status}）`;
            this.failHandshake(Object.assign(new Error(message), { statusCode: 502 }));
            void this.dispose(1011, 'Upstream rejected');
        });
        ws.on('message', raw => this.onUpstreamMessage(raw));
        ws.on('error', () => {
            if (this.disposed) return;
            this.failHandshake(Object.assign(new Error('实时语音服务连接异常；未自动重连'), { statusCode: 502 }));
            if (this.sessionReady) {
                this.emit({ type: 'gateway_realtime_voice_error', fatal: true, message: '实时语音服务连接中断' });
            }
            void this.dispose(1011, 'Upstream error');
        });
        ws.on('close', (code) => {
            if (this.disposed) return;
            this.failHandshake(Object.assign(new Error('实时语音服务提前关闭了连接'), { statusCode: 502 }));
            if (this.sessionReady) {
                this.emit({ type: 'gateway_realtime_voice_closed', reason: 'upstream_closed', code: code || 1000, message: '实时语音会话已结束' });
            }
            void this.dispose(1000, 'Upstream closed');
        });
    }

    sendUpstream(payload) {
        if (this.disposed || !this.upstream || this.upstream.readyState !== WebSocket.OPEN) {
            fail('实时语音连接尚未就绪或已断开', 409);
        }
        if ((this.upstream.bufferedAmount || 0) > MAX_UPSTREAM_BYTES) {
            fail('实时语音上行缓冲已满，请稍候', 429);
        }
        this.upstream.send(JSON.stringify(payload));
    }

    onUpstreamMessage(raw) {
        if (this.disposed) return;
        let event;
        try { event = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)); }
        catch { return; }
        if (!event || typeof event.type !== 'string') return;
        if (event.type === 'session.created') {
            try { this.sendUpstream(buildSessionUpdatePayload(this.config)); }
            catch (error) { this.failHandshake(error); void this.dispose(); }
            return;
        }
        if (event.type === 'session.updated' && !this.sessionReady) {
            this.completeHandshake(event.session);
            return;
        }
        if (event.type === 'error') {
            const detail = '实时语音服务返回错误，请检查模型、音色和会话参数';
            const fatal = event.error?.type === 'server_error' || !this.sessionReady;
            if (!this.sessionReady) {
                this.failHandshake(Object.assign(new Error(`实时语音配置被拒绝：${detail}`), { statusCode: 502 }));
                void this.dispose(1011, 'Session configuration rejected');
                return;
            }
            this.emit({ type: 'gateway_realtime_voice_error', fatal, code: 'upstream_error', message: detail });
            if (fatal) void this.dispose(1011, 'Upstream server error');
            return;
        }
        if (!this.sessionReady) return;
        // Forward bounded, sanitized realtime speech & transcript events without any credentials.
        const forwarded = this.projectUpstreamEvent(event);
        if (forwarded) this.emit({ type: 'gateway_realtime_voice', event: forwarded });
    }

    projectUpstreamEvent(event) {
        switch (event.type) {
            case 'input_audio_buffer.speech_started':
                return { type: event.type, itemId: event.item_id || null, audioStartMs: event.audio_start_ms ?? null };
            case 'input_audio_buffer.speech_stopped':
                return { type: event.type, itemId: event.item_id || null, audioEndMs: event.audio_end_ms ?? null, reason: event.reason || null };
            case 'input_audio_buffer.committed':
                return { type: event.type, itemId: event.item_id || null };
            case 'input_audio_buffer.cleared':
                return { type: event.type };
            case 'conversation.item.input_audio_transcription.delta':
                return { type: event.type, itemId: event.item_id || null, text: String(event.text || ''), stash: String(event.stash || '') };
            case 'conversation.item.input_audio_transcription.completed':
                return { type: event.type, itemId: event.item_id || null, transcript: String(event.transcript || '') };
            case 'conversation.item.input_audio_transcription.failed':
                return { type: event.type, itemId: event.item_id || null, message: '语音识别失败' };
            case 'conversation.item.ambient_audio_transcription.delta':
            case 'conversation.item.ambient_audio_transcription.completed':
                return { type: event.type, transcript: String(event.transcript || event.text || '') };
            case 'response.created':
                return { type: event.type, responseId: event.response?.id || null };
            case 'response.audio.delta':
                return typeof event.delta === 'string' && event.delta ? { type: event.type, responseId: event.response_id || null, itemId: event.item_id || null, delta: event.delta } : null;
            case 'response.audio.done':
                return { type: event.type, responseId: event.response_id || null, itemId: event.item_id || null };
            case 'response.audio_transcript.delta':
            case 'response.text.delta':
                return { type: event.type, responseId: event.response_id || null, itemId: event.item_id || null, delta: String(event.delta || '') };
            case 'response.audio_transcript.done':
                return { type: event.type, responseId: event.response_id || null, itemId: event.item_id || null, transcript: String(event.transcript || '') };
            case 'response.text.done':
                return { type: event.type, responseId: event.response_id || null, itemId: event.item_id || null, text: String(event.text || '') };
            case 'response.done':
                return { type: event.type, responseId: event.response?.id || null, status: event.response?.status || 'completed', usage: Object.fromEntries(['input_tokens', 'output_tokens', 'total_tokens'].filter(key => Number.isFinite(event.response?.usage?.[key])).map(key => [key, event.response.usage[key]])) };
            default:
                return null;
        }
    }

    async handle(message) {
        if (this.disposed) fail('实时语音会话已关闭', 409);
        switch (message.type) {
            case 'realtime_voice_audio': {
                if (!base64PcmValid(message.audio)) fail('实时语音音频帧格式无效（需 16kHz 16-bit 单声道 PCM base64）');
                this.sendUpstream({ type: 'input_audio_buffer.append', audio: message.audio });
                return { accepted: true };
            }
            case 'realtime_voice_commit': {
                if (this.config.turnDetection === 'push_to_talk') {
                    this.sendUpstream({ type: 'input_audio_buffer.commit' });
                }
                this.sendUpstream({ type: 'response.create' });
                return { committed: true };
            }
            case 'realtime_voice_clear': {
                if (this.config.turnDetection === 'push_to_talk') {
                    this.sendUpstream({ type: 'input_audio_buffer.clear' });
                }
                return { cleared: true };
            }
            case 'realtime_voice_interrupt': {
                this.sendUpstream({ type: 'response.cancel' });
                return { cancelled: true };
            }
            case 'realtime_voice_text': {
                const text = typeof message.text === 'string' ? message.text.trim() : '';
                if (!text || text.length > MAX_TEXT_CHARS || /\0/.test(text)) fail('发送文本无效或超出上限');
                this.sendUpstream({
                    type: 'conversation.item.create',
                    item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
                });
                if (message.respond !== false) this.sendUpstream({ type: 'response.create' });
                return { sent: true };
            }
            case 'close_realtime_voice': {
                await this.dispose(1000, 'Closed by user');
                return { closed: true };
            }
            default:
                fail(`不支持的实时语音指令: ${message.type}`);
        }
    }

    async dispose(code = 1000, reason = 'Closed') {
        if (this.disposed) return this.stopping;
        this.disposed = true;
        clearTimeout(this.maxTimer);
        clearTimeout(this.handshakeTimer);
        this.failHandshake(Object.assign(new Error('实时语音连接已取消'), { statusCode: 409 }));
        const ws = this.upstream;
        this.upstream = null;
        this.stopping = (async () => {
            if (ws && ws.readyState !== WebSocket.CLOSED) {
                await new Promise(resolve => {
                    const timer = setTimeout(() => { try { ws.terminate(); } catch {} }, 1000);
                    timer.unref?.();
                    ws.once('close', () => { clearTimeout(timer); resolve(); });
                    try {
                        if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
                        else if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
                    } catch { try { ws.terminate(); } catch {} }
                });
            }
            try { this.releaseProvider?.(); } finally { this.releaseProvider = null; this.onDone?.(this); }
        })();
        return this.stopping;
    }
}

class PiRealtimeVoiceService {
    constructor({ createModelRuntime, providerService, createWebSocket = (url, options) => new WebSocket(url, options),
        handshakeTimeoutMs = 15000, maxDurationMs = MAX_DURATION_MS, maxSessions = MAX_SESSIONS, blocked = () => false }) {
        this.createModelRuntime = createModelRuntime;
        this.providerService = providerService;
        this.createWebSocket = createWebSocket;
        this.handshakeTimeoutMs = handshakeTimeoutMs;
        this.maxDurationMs = maxDurationMs;
        this.maxSessions = maxSessions;
        this.blocked = blocked;
        this.sessions = new Set();
        this.openingTasks = new Set();
        this.inspecting = 0;
        this.connecting = 0;
        this.closed = false;
    }

    get active() {
        return this.inspecting + this.connecting + this.sessions.size;
    }

    async catalog() {
        if (this.closed) fail('实时语音服务正在关闭', 503);
        this.inspecting++;
        try {
            let models = [], nativeCatalogUnavailable = false;
            try {
                const runtime = await this.createModelRuntime();
                const available = await runtime.getAvailable(undefined, { signal: AbortSignal.timeout(20000) });
                models = realtimeModels(runtime.getModels(), available);
            } catch {
                if (!this.providerService) fail('无法读取实时语音模型，请检查服务商与认证配置', 503);
                nativeCatalogUnavailable = true;
            }
            if (this.providerService) {
                const snapshot = await this.providerService.snapshot();
                for (const definition of snapshot.realtimeModels) {
                    const provider = snapshot.providers.find(item => item.id === definition.providerId);
                    if (!provider || provider.auth.mode !== 'none' && !provider.keyConfigured) continue;
                    models.push({
                        id: `realtime:${provider.id}:${definition.id}`,
                        provider: provider.id,
                        modelId: definition.remoteModel,
                        name: `${provider.name} / ${definition.name}`,
                        protocol: definition.protocol,
                        baseUrl: provider.baseUrl,
                        voice: definition.voice || defaultVoiceForModel(definition.remoteModel),
                        turnDetection: definition.turnDetection || 'smart_turn_v2',
                        instructions: definition.instructions || '',
                        speechRate: definition.speechRate ?? 1,
                        enableSearch: Boolean(definition.enableSearch),
                        managedModelId: definition.id,
                        configurationRevision: snapshot.revision
                    });
                }
            }
            // Prefer managed media definitions first so explicit voice/settings take priority.
            models.sort((a, b) => Number(Boolean(b.managedModelId)) - Number(Boolean(a.managedModelId)) || a.name.localeCompare(b.name));
            const revision = createHash('sha256').update(JSON.stringify(models)).digest('hex');
            return {
                revision,
                models,
                maximumSeconds: Math.floor(this.maxDurationMs / 1000),
                inputSampleRate: 16000,
                outputSampleRate: 24000,
                nativeCatalogUnavailable
            };
        } catch (error) {
            if (error.statusCode) throw error;
            fail('无法读取实时语音模型，请检查服务商与认证配置', 503);
        } finally {
            this.inspecting--;
        }
    }

    async configuration() {
        if (this.closed || !this.providerService) fail('实时语音模型配置暂不可用', 503);
        this.inspecting++;
        try {
            const snapshot = await this.providerService.snapshot();
            const catalog = await this.catalog();
            if (snapshot.revision !== this.providerService.read().revision) fail('语音配置已变化，请刷新后再编辑', 409);
            return { ...snapshot, availableModels: catalog.models, nativeCatalogUnavailable: catalog.nativeCatalogUnavailable };
        } finally {
            this.inspecting--;
        }
    }

    saveModel(input) {
        if (this.closed || this.blocked()) fail('配置正在变更或服务正在关闭，请稍后保存', 409);
        if (!this.providerService) fail('实时语音模型配置暂不可用', 503);
        return this.providerService.saveRealtimeModel(input);
    }

    removeModel(id, input) {
        if (this.closed || this.blocked()) fail('配置正在变更或服务正在关闭，请稍后修改', 409);
        if (!this.providerService) fail('实时语音模型配置暂不可用', 503);
        return this.providerService.removeRealtimeModel(id, input);
    }

    openSession(input, emit, signal) {
        const task = this.executeOpen(input, emit, signal);
        this.openingTasks.add(task);
        void task.then(() => this.openingTasks.delete(task), () => this.openingTasks.delete(task));
        return task;
    }

    async executeOpen(input, emit, signal) {
        if (this.closed || this.blocked()) fail('配置正在变更或服务正在关闭，请稍后再开始语音对话', 409);
        if (!input || input.confirmed !== true || typeof input.modelId !== 'string' || typeof input.revision !== 'string') {
            fail('实时语音对话启动参数无效');
        }
        if (this.connecting + this.sessions.size >= this.maxSessions) {
            fail('实时语音通话数量已达上限，请先挂断当前通话', 429);
        }
        // Reserve capacity before any await.
        this.connecting++;
        let lease = null;
        try {
            const catalog = await this.catalog();
            if (input.revision !== catalog.revision) fail('实时语音模型配置已变化，请重新选择模型', 409);
            const model = catalog.models.find(item => item.id === input.modelId);
            if (!model) fail('请选择已配置且支持的实时语音模型', 409);
            const config = normalizeSessionOverrides(input.session || {}, model);
            let headers;
            if (model.managedModelId) {
                lease = await this.providerService.leaseRealtime(model);
                headers = authHeaders(lease.provider, lease.key);
            } else {
                let auth;
                try {
                    const runtime = await this.createModelRuntime();
                    auth = await runtime.getAuth(model.provider, { signal: AbortSignal.timeout(10000) });
                } catch { fail('无法读取实时语音模型认证', 503); }
                if (!auth?.auth?.apiKey) fail('实时语音模型需要已配置的 API Key', 503);
                headers = { Authorization: `Bearer ${auth.auth.apiKey}` };
            }
            if (this.closed || this.blocked() || signal?.aborted) fail('配置正在变更或连接已取消，未发起连接', 409);
            const { httpUrl, wsUrl } = realtimeWsUrl(model.baseUrl, model.modelId);
            const releaseProvider = lease ? lease.release : null;
            lease = null;
            const session = new PiRealtimeVoiceSession({
                service: this,
                model,
                config,
                headers,
                httpUrl,
                wsUrl,
                createWebSocket: this.createWebSocket,
                releaseProvider,
                emit,
                onDone: active => { active.stoppedSignal?.(); this.sessions.delete(active); }
            });
            this.sessions.add(session);
            if (session.disposed) void session.dispose().finally(() => this.sessions.delete(session));
            if (signal) {
                const abort = () => { void session.dispose(); };
                signal.addEventListener('abort', abort, { once: true });
                void session.ready.catch(() => {}).finally(() => { if (session.disposed) signal.removeEventListener('abort', abort); });
                session.stoppedSignal = () => signal.removeEventListener('abort', abort);
                if (signal.aborted) abort();
            }
            return session;
        } catch (error) {
            lease?.release?.();
            throw error;
        } finally {
            this.connecting--;
        }
    }

    async dispose() {
        this.closed = true;
        await Promise.allSettled([...this.openingTasks]);
        await Promise.allSettled([...this.sessions].map(session => session.dispose(1001, 'Server shutting down')));
        this.sessions.clear();
    }
}

function mountRealtimeVoiceRoutes(router, service, store) {
    const respond = handler => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try { res.json(await handler(req)); }
        catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : '实时语音操作失败' }); }
    };
    router.get('/composer/realtime-voice/settings', respond(() => service.configuration()));
    router.post('/composer/realtime-voice/models', respond(req => service.saveModel(req.body)));
    router.delete('/composer/realtime-voice/models/:id', respond(req => service.removeModel(req.params.id, req.body)));
    router.get('/composer/realtime-voice', respond(req => {
        if (req.query.cwd) store.resolveProject(req.query.cwd);
        return service.catalog();
    }));
}

module.exports = {
    PiRealtimeVoiceService,
    realtimeModels,
    realtimeWsUrl,
    buildSessionUpdatePayload,
    mountRealtimeVoiceRoutes
};
