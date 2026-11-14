(() => {
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const node = (tag, className = '', text = '') => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        return el;
    };
    const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());

    function downsamplePcm16(float32, inputRate, targetRate = 16000) {
        if (!float32?.length || !(inputRate > 0)) return new Uint8Array(0);
        const frames = Math.floor(float32.length * targetRate / inputRate);
        if (frames <= 0) return new Uint8Array(0);
        const buffer = new ArrayBuffer(frames * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < frames; i++) {
            const start = Math.floor(i * inputRate / targetRate);
            const end = Math.min(float32.length, Math.max(start + 1, Math.floor((i + 1) * inputRate / targetRate)));
            let sum = 0;
            for (let j = start; j < end; j++) sum += float32[j];
            const sample = Math.max(-1, Math.min(1, sum / (end - start)));
            view.setInt16(i * 2, sample * (sample < 0 ? 32768 : 32767), true);
        }
        return new Uint8Array(buffer);
    }

    class PcmResampler {
        constructor(rate) { this.ratio = rate / 16000; this.pending = new Float32Array(0); this.position = 0; }
        push(input) {
            const samples = new Float32Array(this.pending.length + input.length);
            samples.set(this.pending); samples.set(input, this.pending.length);
            const count = Math.max(0, Math.floor((samples.length - this.position) / this.ratio));
            const bytes = new Uint8Array(count * 2), view = new DataView(bytes.buffer);
            for (let i = 0; i < count; i++) {
                const start = Math.floor(this.position), end = Math.min(samples.length, Math.max(start + 1, Math.floor(this.position + this.ratio)));
                let sum = 0;
                for (let at = start; at < end; at++) sum += samples[at];
                const value = Math.max(-1, Math.min(1, sum / (end - start)));
                view.setInt16(i * 2, value * (value < 0 ? 32768 : 32767), true);
                this.position += this.ratio;
            }
            const consumed = Math.floor(this.position);
            this.pending = samples.slice(consumed); this.position -= consumed;
            return bytes;
        }
    }

    function bytesToBase64(bytes) {
        let binary = '';
        const step = 0x8000;
        for (let i = 0; i < bytes.length; i += step) {
            binary += String.fromCharCode(...bytes.subarray(i, i + step));
        }
        return btoa(binary);
    }

    function base64ToFloat32(b64) {
        const binary = atob(b64);
        const samples = Math.floor(binary.length / 2);
        const out = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            const lo = binary.charCodeAt(i * 2);
            const hi = binary.charCodeAt(i * 2 + 1);
            let val = (hi << 8) | lo;
            if (val >= 0x8000) val -= 0x10000;
            out[i] = val / 32768;
        }
        return out;
    }

    function formatTimer(seconds) {
        const m = String(Math.floor(seconds / 60)).padStart(2, '0');
        const s = String(seconds % 60).padStart(2, '0');
        return `${m}:${s}`;
    }

    class PiRealtimeVoice {
        constructor(host) {
            this.host = host;
            this.button = document.getElementById('pi-realtime-voice-button');
            this.dialog = document.getElementById('pi-realtime-voice-dialog');
            if (!this.button || !this.dialog) return;
            this.enabled = false;
            this.phase = 'idle'; // idle | connecting | listening | speaking | error
            this.muted = false;
            this.responding = false;
            this.epoch = 0;
            this.catalogRequest = 0;
            this.catalog = null;
            this.model = null;
            this.socket = null;
            this.pendingRequests = new Map();
            this.nextReqId = 0;
            this.turns = [];
            this.turnByItemId = new Map();
            this.activePlayNodes = new Set();
            this.nextPlayTime = 0;
            this.startedAt = 0;
            this.timer = null;

            this.buildDialog();
            this.button.addEventListener('click', () => this.openDialog());
            window.addEventListener('pagehide', () => this.hangup());
            document.addEventListener('visibilitychange', () => { if (document.hidden && this.isCallActive()) this.hangup(); });
            for (const event of ['realtime-voice:configured', 'media-lab:configured', 'workspace:settings-closed']) {
                window.addEventListener(event, () => { if (this.enabled) void this.load(true); });
            }
            this.sync();
        }

        buildDialog() {
            const header = node('header', 'pi-rtv-header');
            const heading = node('div', 'pi-rtv-heading');
            this.titleEl = node('h2', '', translateUi("实时语音对话"));
            this.titleEl.id = 'pi-rtv-title';
            this.subtitleEl = node('small', '', translateUi("双工低延迟语音交流 · 通话记录可选择性加入草稿"));
            heading.append(this.titleEl, this.subtitleEl);

            const headerActions = node('div', 'pi-rtv-header-actions');
            this.settingsBtn = node('button', 'icon-btn subtle');
            this.settingsBtn.type = 'button';
            this.settingsBtn.title = translateUi("语音与模型设置");
            this.settingsBtn.setAttribute('aria-label', this.settingsBtn.title);
            this.settingsBtn.innerHTML = '<i class="fa-solid fa-sliders" aria-hidden="true"></i>';
            this.settingsBtn.addEventListener('click', () => {
                if (this.isCallActive()) return;
                this.dialog.close();
                window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'media', section: 'realtime' } }));
            });

            this.closeBtn = node('button', 'icon-btn subtle');
            this.closeBtn.type = 'button';
            this.closeBtn.title = translateUi("关闭窗口");
            this.closeBtn.setAttribute('aria-label', this.closeBtn.title);
            this.closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
            this.closeBtn.addEventListener('click', () => {
                this.hangup();
                this.dialog.close();
            });
            headerActions.append(this.settingsBtn, this.closeBtn);
            header.append(heading, headerActions);

            const controls = node('div', 'pi-rtv-controls-bar');
            const modelWrap = node('label'); modelWrap.append(node('span', '', translateUi("实时语音模型")));
            this.modelSelect = node('select'); this.modelSelect.id = 'pi-rtv-model-select';
            this.modelSelect.setAttribute('aria-label', translateUi("实时语音模型"));
            this.modelSelect.addEventListener('change', () => this.onModelSelected());
            modelWrap.append(this.modelSelect);

            const voiceWrap = node('label'); voiceWrap.append(node('span', '', translateUi("音色 ID")));
            this.voiceInput = node('input'); this.voiceInput.type = 'text'; this.voiceInput.maxLength = 200;
            this.voiceInput.placeholder = 'longanqian';
            this.voiceInput.setAttribute('aria-label', translateUi("音色 ID"));
            voiceWrap.append(this.voiceInput);

            const turnWrap = node('label'); turnWrap.append(node('span', '', translateUi("对话模式")));
            this.turnSelect = node('select'); this.turnSelect.setAttribute('aria-label', translateUi("对话模式"));
            for (const [val, label] of [
                ['smart_turn_v2', translateUi("智能轮次 v2")],
                ['smart_turn', translateUi("智能轮次 v1")],
                ['server_vad', translateUi("自动检测 VAD")],
                ['push_to_talk', translateUi("手动发送语音")]
            ]) this.turnSelect.append(new Option(label, val));
            turnWrap.append(this.turnSelect);
            controls.append(modelWrap, voiceWrap, turnWrap);

            this.statusBanner = node('div', 'pi-rtv-status-banner');
            this.statusBanner.dataset.phase = 'idle';
            const statusLeft = node('div', 'pi-rtv-status-indicator');
            statusLeft.append(node('span', 'pi-rtv-dot'));
            this.statusText = node('span', 'pi-rtv-status-text', translateUi("准备就绪，点击下方开始通话。建议使用耳机避免回声打断。"));
            this.statusText.setAttribute('role', 'status');
            this.statusText.setAttribute('aria-live', 'polite');
            statusLeft.append(this.statusText);
            this.timerEl = node('span', 'pi-rtv-timer', '00:00');
            this.timerEl.hidden = true;
            this.statusBanner.append(statusLeft, this.timerEl);

            this.transcriptEl = node('div', 'pi-rtv-transcript');
            this.renderTranscript();

            const textRow = node('form', 'pi-rtv-text-row');
            this.textInput = node('input'); this.textInput.type = 'text'; this.textInput.maxLength = 4000;
            this.textInput.placeholder = translateUi("通话中也可输入文字补充…");
            this.textInput.setAttribute('aria-label', translateUi("发送文字到实时语音对话"));
            this.textSendBtn = node('button', '', translateUi("发送"));
            this.textSendBtn.type = 'submit';
            textRow.append(this.textInput, this.textSendBtn);
            textRow.addEventListener('submit', e => { e.preventDefault(); void this.sendText(); });
            this.textInput.addEventListener('input', () => this.sync());

            const footer = node('footer', 'pi-rtv-footer');
            const left = node('div', 'pi-rtv-actions-left');
            const right = node('div', 'pi-rtv-actions-right');

            this.insertAllBtn = node('button', '', translateUi("将记录加入主草稿"));
            this.insertAllBtn.type = 'button';
            this.insertAllBtn.addEventListener('click', () => this.insertAllTurns());
            this.clearLogBtn = node('button', '', translateUi("清空记录"));
            this.clearLogBtn.type = 'button';
            this.clearLogBtn.addEventListener('click', () => { this.turns = []; this.turnByItemId.clear(); this.renderTranscript(); this.sync(); });
            left.append(this.insertAllBtn, this.clearLogBtn);

            this.muteBtn = node('button'); this.muteBtn.type = 'button';
            this.muteBtn.addEventListener('click', () => { this.muted = !this.muted; this.sync(); });

            this.commitBtn = node('button', '', translateUi("说完发送"));
            this.commitBtn.type = 'button';
            this.commitBtn.addEventListener('click', () => { void this.commitAudio(); });

            this.interruptBtn = node('button', '', translateUi("打断播报"));
            this.interruptBtn.type = 'button';
            this.interruptBtn.addEventListener('click', () => { void this.interrupt(); });

            this.callBtn = node('button', 'pi-rtv-primary');
            this.callBtn.type = 'button';
            this.callBtn.addEventListener('click', () => {
                if (this.isCallActive()) this.hangup();
                else void this.startCall();
            });
            right.append(this.muteBtn, this.commitBtn, this.interruptBtn, this.callBtn);
            footer.append(left, right);

            this.dialog.replaceChildren(header, controls, this.statusBanner, this.transcriptEl, textRow, footer);
            this.dialog.addEventListener('close', () => {
                if (!this.dialog.open) this.hangup();
            });
        }

        isCallActive() {
            return ['connecting', 'listening', 'speaking'].includes(this.phase);
        }

        async setEnabled(value) {
            if (!value) this.hangup();
            this.enabled = value;
            this.sync();
            if (value) await this.load();
        }

        async load(force = false) {
            if (this.loading && !force) return this.loading;
            const req = ++this.catalogRequest;
            this.loading = (async () => {
                try {
                    const data = await this.host.api('/api/pi/composer/realtime-voice');
                    if (!this.enabled || req !== this.catalogRequest) return;
                    this.catalog = data;
                    let preferred = '';
                    try { preferred = localStorage.getItem('pi.web.realtimeVoiceModel') || ''; } catch {}
                    this.model = data.models?.find(item => item.id === preferred) || data.models?.[0] || null;
                    this.populateModels();
                } catch {
                    if (req !== this.catalogRequest) return;
                    this.catalog = this.model = null;
                    this.populateModels();
                } finally {
                    if (req === this.catalogRequest) { this.loading = null; this.sync(); }
                }
            })();
            this.sync();
            return this.loading;
        }

        populateModels() {
            const models = this.catalog?.models || [];
            this.modelSelect.replaceChildren();
            if (!models.length) {
                this.modelSelect.append(new Option(translateUi("没有可用的实时语音模型"), ''));
                this.modelSelect.disabled = true;
                return;
            }
            for (const m of models) this.modelSelect.append(new Option(m.name, m.id));
            this.modelSelect.disabled = this.isCallActive();
            this.modelSelect.value = this.model?.id || models[0].id;
            this.applyModelDefaults(this.model || models[0]);
        }

        applyModelDefaults(model) {
            if (!model || this.isCallActive()) return;
            this.voiceInput.value = model.voice || (/3\.1/.test(model.modelId) ? 'longanqian_v3.1' : 'longanqian');
            this.turnSelect.value = model.turnDetection || 'smart_turn_v2';
        }

        onModelSelected() {
            const selected = (this.catalog?.models || []).find(item => item.id === this.modelSelect.value) || null;
            this.model = selected;
            if (selected) {
                try { localStorage.setItem('pi.web.realtimeVoiceModel', selected.id); } catch {}
                this.applyModelDefaults(selected);
            }
            this.sync();
        }

        async openDialog() {
            if (!this.enabled) return;
            if (!this.catalog) await this.load();
            if (!this.dialog.open) this.dialog.showModal();
            if (!this.model) {
                this.setStatus('idle', translateUi("尚未配置可用的实时语音模型，请点击右上角设置按钮添加。"));
            } else if (!this.isCallActive()) {
                this.setStatus('idle', translateUi("准备就绪，点击下方开始通话。建议使用耳机避免回声打断。"));
            }
            this.sync();
        }

        setStatus(phase, message) {
            this.phase = phase;
            this.statusBanner.dataset.phase = phase;
            if (message) this.statusText.textContent = message;
            this.sync();
        }

        sync() {
            if (!this.button) return;
            const active = this.isCallActive();
            const context = this.host.context();
            if (active && this.origin && (context.key !== this.origin.key || context.generation !== this.origin.generation || !context.connected)) { this.hangup(); return; }
            this.button.hidden = !this.enabled;
            this.button.disabled = !this.enabled || (!active && Boolean(this.loading));
            this.button.dataset.active = String(active);
            const label = active ? translateUi("实时语音通话中（点击查看）") : translateUi("实时语音对话");
            this.button.title = label;
            this.button.setAttribute('aria-label', label);

            this.settingsBtn.disabled = active;
            this.modelSelect.disabled = active || !(this.catalog?.models?.length > 0);
            this.voiceInput.disabled = active || !this.model;
            this.turnSelect.disabled = active || !this.model;

            const ready = this.phase === 'listening' || this.phase === 'speaking';
            this.textInput.disabled = !ready;
            this.textSendBtn.disabled = !ready || !this.textInput.value.trim() || this.responding || this.sendingText;

            this.muteBtn.hidden = !ready;
            this.muteBtn.innerHTML = this.muted
                ? `<i class="fa-solid fa-microphone-slash" aria-hidden="true"></i><span>${translateUi("取消静音")}</span>`
                : `<i class="fa-solid fa-microphone" aria-hidden="true"></i><span>${translateUi("静音")}</span>`;

            this.commitBtn.hidden = !ready || this.turnSelect.value !== 'push_to_talk';
            this.commitBtn.disabled = !ready || this.responding;

            this.interruptBtn.hidden = !ready;
            this.interruptBtn.disabled = !ready || (!this.responding && this.activePlayNodes.size === 0);

            this.callBtn.className = active ? 'pi-rtv-danger' : 'pi-rtv-primary';
            this.callBtn.disabled = !active && (!this.model || !context.connected);
            this.callBtn.innerHTML = active
                ? `<i class="fa-solid fa-phone-slash" aria-hidden="true"></i><span>${translateUi("结束通话")}</span>`
                : `<i class="fa-solid fa-headset" aria-hidden="true"></i><span>${translateUi("开始通话")}</span>`;

            const hasCompletedTurns = this.turns.some(turn => turn.text.trim());
            const ctx = this.host.context();
            this.insertAllBtn.disabled = !hasCompletedTurns || !ctx.connected || ctx.submitting;
            this.clearLogBtn.disabled = this.turns.length === 0 || active;
            this.timerEl.hidden = !active;
        }

        async startCall() {
            if (this.isCallActive() || !this.host.context().connected) return;
            const selectedModel = this.model;
            const overrides = { voice: this.voiceInput.value.trim(), turnDetection: this.turnSelect.value };
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !AudioCtx) {
                this.setStatus('error', translateUi("实时语音需要 HTTPS 或 localhost 以及浏览器麦克风支持。"));
                return;
            }
            const epoch = ++this.epoch;
            this.origin = { ...this.host.context() };
            this.host.beforeStart?.();
            this.muted = false;
            this.responding = false;
            this.cancelledResponses = new Set();
            this.setStatus('connecting', translateUi("正在请求麦克风并建立实时语音连接…"));
            if (epoch !== this.epoch) return;
            try {
                this.audioCtx = new AudioCtx();
                await this.audioCtx.resume();
                await this.load(true);
                if (epoch !== this.epoch) return;
                this.model = this.catalog?.models?.find(item => item.id === selectedModel?.id) || this.model;
                if (!this.model || !this.catalog) throw new Error(translateUi("没有可用的实时语音模型，请先在语音设置中配置。"));
                this.voiceInput.value = overrides.voice;
                this.turnSelect.value = overrides.turnDetection;
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: false
                });
                if (epoch !== this.epoch) { stopTracks(stream); return; }
                this.stream = stream;

                const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
                const ws = new WebSocket(`${protocol}//${location.host}/api/pi/ws`);
                this.socket = ws;
                ws.addEventListener('message', event => this.onSocketMessage(epoch, event.data));
                ws.addEventListener('close', () => {
                    if (epoch !== this.epoch || this.socket !== ws) return;
                    const wasActive = this.isCallActive();
                    this.cleanupMediaAndSocket();
                    if (wasActive) this.setStatus('idle', translateUi("实时语音通话已结束。"));
                });
                ws.addEventListener('error', () => {
                    if (epoch !== this.epoch || this.socket !== ws) return;
                    this.cleanupMediaAndSocket();
                    this.setStatus('error', translateUi("实时语音连接异常中断。"));
                });

                await new Promise((resolve, reject) => {
                    ws.addEventListener('open', resolve, { once: true });
                    ws.addEventListener('error', () => reject(new Error(translateUi("无法建立实时语音通道"))), { once: true });
                    ws.addEventListener('close', () => reject(new Error(translateUi("实时语音通道连接被拒绝"))), { once: true });
                });
                if (epoch !== this.epoch) return;

                const context = this.host.context();
                const token = this.host.token?.() || '';
                const openResult = await this.sendCommand('open_realtime_voice', {
                    ...(token ? { token } : {}),
                    confirmed: true,
                    cwd: context.cwd || undefined,
                    modelId: this.model.id,
                    revision: this.catalog.revision,
                    session: {
                        voice: this.voiceInput.value.trim() || undefined,
                        turnDetection: this.turnSelect.value,
                        speechRate: this.model.speechRate ?? 1,
                        enableSearch: Boolean(this.model.enableSearch),
                        ...(this.model.instructions ? { instructions: this.model.instructions } : {})
                    }
                }, 20000);
                if (epoch !== this.epoch) return;
                this.outputSampleRate = openResult?.outputSampleRate || 24000;
                this.setupMicCapture(epoch);
                this.startedAt = Date.now();
                this.timerEl.textContent = '00:00';
                this.timer = setInterval(() => {
                    this.timerEl.textContent = formatTimer(Math.floor((Date.now() - this.startedAt) / 1000));
                }, 1000);
                this.setStatus('listening', this.turnSelect.value === 'push_to_talk'
                    ? translateUi("已连接（手动模式）：说话后点击“说完发送”。")
                    : translateUi("正在聆听，请直接说话…"));
            } catch (error) {
                if (epoch !== this.epoch) return;
                this.cleanupMediaAndSocket();
                this.setStatus('error', translateUi(error?.message || "无法启动实时语音通话"));
            }
        }

        setupMicCapture(epoch) {
            if (!this.audioCtx || !this.stream) return;
            const rate = this.audioCtx.sampleRate;
            this.resampler = new PcmResampler(rate);
            this.micSource = this.audioCtx.createMediaStreamSource(this.stream);
            this.processor = this.audioCtx.createScriptProcessor(2048, 1, 1);
            this.muteGain = this.audioCtx.createGain();
            this.muteGain.gain.value = 0;
            this.processor.onaudioprocess = event => {
                if (epoch !== this.epoch || this.muted || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
                if (this.phase !== 'listening' && this.phase !== 'speaking') return;
                if (this.socket.bufferedAmount > 512 * 1024) { this.hangup(); this.setStatus('error', translateUi('网络发送缓冲已满，通话已结束；未自动重连')); return; }
                const pcm = this.resampler.push(event.inputBuffer.getChannelData(0));
                if (!pcm.length) return;
                this.fireCommand('realtime_voice_audio', { audio: bytesToBase64(pcm) });
            };
            this.micSource.connect(this.processor);
            this.processor.connect(this.muteGain);
            this.muteGain.connect(this.audioCtx.destination);
        }

        sendCommand(type, payload = {}, timeoutMs = 10000) {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                return Promise.reject(new Error(translateUi("实时语音通道未连接")));
            }
            const id = `rtv-${++this.nextReqId}`;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.pendingRequests.delete(id);
                    reject(new Error(translateUi("实时语音操作超时")));
                }, timeoutMs);
                this.pendingRequests.set(id, { resolve, reject, timer });
                this.socket.send(JSON.stringify({ id, type, ...payload }));
            });
        }

        fireCommand(type, payload = {}) {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
            this.socket.send(JSON.stringify({ ...(type === 'realtime_voice_audio' ? {} : { id: `rtv-${++this.nextReqId}` }), type, ...payload }));
        }

        onSocketMessage(epoch, raw) {
            if (epoch !== this.epoch) return;
            let msg;
            try { msg = JSON.parse(raw); } catch { return; }
            if (msg.type === 'response' && msg.id) {
                const pending = this.pendingRequests.get(msg.id);
                if (!pending) return;
                clearTimeout(pending.timer);
                this.pendingRequests.delete(msg.id);
                if (msg.success) pending.resolve(msg.data);
                else pending.reject(new Error(translateUi(msg.error || "操作失败")));
                return;
            }
            if (msg.type === 'gateway_realtime_voice_error') {
                this.setStatus(msg.fatal ? 'error' : this.phase, msg.message || translateUi("实时语音服务返回错误"));
                if (msg.fatal) this.cleanupMediaAndSocket();
                return;
            }
            if (msg.type === 'gateway_realtime_voice_closed') {
                this.cleanupMediaAndSocket();
                this.setStatus('idle', msg.message || translateUi("实时语音通话已结束。"));
                return;
            }
            if (msg.type === 'gateway_realtime_voice' && msg.event) {
                this.handleRealtimeEvent(msg.event);
            }
        }

        handleRealtimeEvent(evt) {
            if (evt.type === 'response.audio.delta' && this.cancelledResponses?.has(evt.responseId)) return;
            switch (evt.type) {
                case 'input_audio_buffer.speech_started':
                    if (this.currentResponse) this.cancelledResponses?.add(this.currentResponse);
                    this.stopPlayback();
                    this.responding = false;
                    this.setStatus('listening', translateUi("检测到你正在说话…"));
                    if (evt.itemId) this.ensureTurn(evt.itemId, 'user');
                    break;
                case 'input_audio_buffer.speech_stopped':
                    if (evt.reason === 'turn_invalid') {
                        if (evt.itemId) this.removeEmptyTurn(evt.itemId);
                        this.setStatus('listening', translateUi("继续聆听中…"));
                    } else {
                        this.setStatus('listening', translateUi("语音已接收，正在思考…"));
                    }
                    break;
                case 'conversation.item.input_audio_transcription.delta': {
                    const turn = this.ensureTurn(evt.itemId || 'user-live', 'user');
                    turn.text = evt.text || turn.text;
                    turn.stash = evt.stash || '';
                    this.renderTranscript();
                    break;
                }
                case 'conversation.item.input_audio_transcription.completed': {
                    const turn = this.ensureTurn(evt.itemId || `user-${Date.now()}`, 'user');
                    turn.text = evt.transcript || turn.text;
                    turn.stash = '';
                    turn.completed = true;
                    this.renderTranscript();
                    this.sync();
                    break;
                }
                case 'response.created':
                    this.currentResponse = evt.responseId;
                    this.responding = true;
                    this.setStatus('speaking', translateUi("AI 正在回复…"));
                    break;
                case 'response.audio.delta':
                    this.responding = true;
                    if (this.phase !== 'speaking') this.setStatus('speaking', translateUi("AI 正在播报语音…"));
                    this.enqueueAudio(evt.delta);
                    break;
                case 'response.audio_transcript.delta':
                case 'response.text.delta': {
                    const key = evt.itemId || evt.responseId || 'assistant-live';
                    const turn = this.ensureTurn(key, 'assistant');
                    turn.text += evt.delta || '';
                    this.renderTranscript();
                    break;
                }
                case 'response.audio_transcript.done': {
                    const key = evt.itemId || evt.responseId || 'assistant-live';
                    const turn = this.ensureTurn(key, 'assistant');
                    if (evt.transcript) turn.text = evt.transcript;
                    turn.completed = true;
                    this.renderTranscript();
                    this.sync();
                    break;
                }
                case 'response.text.done': {
                    const key = evt.itemId || evt.responseId || 'assistant-live';
                    const turn = this.ensureTurn(key, 'assistant');
                    if (evt.text) turn.text = evt.text;
                    turn.completed = true;
                    this.renderTranscript();
                    this.sync();
                    break;
                }
                case 'response.done':
                    if (evt.responseId && this.currentResponse && evt.responseId !== this.currentResponse) break;
                    this.responding = false;
                    if (evt.status === 'cancelled') this.stopPlayback();
                    if (this.isCallActive()) {
                        this.setStatus('listening', this.turnSelect.value === 'push_to_talk'
                            ? translateUi("等待下一轮发言（说完点“说完发送”）")
                            : translateUi("正在聆听，请直接说话…"));
                    }
                    break;
                default:
                    break;
            }
        }

        ensureTurn(itemId, role) {
            let turn = this.turnByItemId.get(itemId);
            if (!turn) {
                if (this.turns.length >= 100) { this.hangup(); this.setStatus('error', translateUi('通话记录已达上限，请保存记录后清空')); }
                turn = { id: itemId, role, text: '', stash: '', completed: false };
                this.turnByItemId.set(itemId, turn);
                this.turns.push(turn);
            }
            return turn;
        }

        removeEmptyTurn(itemId) {
            const turn = this.turnByItemId.get(itemId);
            if (turn && !turn.text.trim() && !turn.stash.trim()) {
                this.turnByItemId.delete(itemId);
                this.turns = this.turns.filter(item => item !== turn);
                this.renderTranscript();
            }
        }

        enqueueAudio(base64Chunk) {
            if (!this.audioCtx || !base64Chunk) return;
            let samples;
            try { samples = base64ToFloat32(base64Chunk); } catch { return; }
            if (!samples.length) return;
            const rate = this.outputSampleRate || 24000;
            const buffer = this.audioCtx.createBuffer(1, samples.length, rate);
            buffer.getChannelData(0).set(samples);
            const source = this.audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioCtx.destination);
            const now = this.audioCtx.currentTime;
            if (this.nextPlayTime - now > 15) { this.hangup(); this.setStatus('error', translateUi('音频播放缓冲已满，通话已结束')); return; }
            if (this.nextPlayTime < now + 0.02) this.nextPlayTime = now + 0.02;
            const startAt = this.nextPlayTime;
            this.nextPlayTime += buffer.duration;
            this.activePlayNodes.add(source);
            source.onended = () => {
                this.activePlayNodes.delete(source);
                if (this.isCallActive()) this.sync();
            };
            source.start(startAt);
        }

        stopPlayback() {
            for (const source of this.activePlayNodes) {
                try { source.stop(); } catch {}
                try { source.disconnect(); } catch {}
            }
            this.activePlayNodes.clear();
            if (this.audioCtx) this.nextPlayTime = this.audioCtx.currentTime;
            this.sync();
        }

        async commitAudio() {
            if (!this.isCallActive()) return;
            try {
                await this.sendCommand('realtime_voice_commit', {});
                this.setStatus('listening', translateUi("已提交本轮语音，等待回复…"));
            } catch (error) {
                this.setStatus(this.phase, error.message);
            }
        }

        async interrupt() {
            if (this.currentResponse) this.cancelledResponses?.add(this.currentResponse);
            this.stopPlayback();
            if (!this.isCallActive()) return;
            try {
                await this.sendCommand('realtime_voice_interrupt', {});
                this.responding = false;
                this.setStatus('listening', translateUi("已打断播报，请继续说话…"));
            } catch {
                this.responding = false;
                this.sync();
            }
        }

        async sendText() {
            const text = this.textInput.value.trim();
            if (!text || !this.isCallActive() || this.sendingText || this.responding) return;
            this.sendingText = true;
            this.sync();
            this.stopPlayback();
            const turn = this.ensureTurn(`text-${Date.now()}-${Math.random()}`, 'user');
            turn.text = text;
            turn.completed = true;
            this.renderTranscript();
            try {
                await this.sendCommand('realtime_voice_text', { text, respond: true });
                if (this.textInput.value.trim() === text) this.textInput.value = '';
                this.setStatus('speaking', translateUi("文字已发送，等待 AI 回复…"));
            } catch (error) {
                this.hangup();
                this.setStatus('error', error.message);
            } finally { this.sendingText = false; this.sync(); }
        }

        insertTurnText(text) {
            const trimmed = String(text || '').trim();
            if (!trimmed) return;
            try {
                if (this.host.append(trimmed)) {
                    this.host.toast?.(translateUi("已加入主对话草稿"), 'success', 2600);
                } else {
                    this.host.toast?.(translateUi("当前会话未连接或正在提交，无法加入草稿"), 'info');
                }
            } catch (error) {
                this.host.toast?.(translateUi(error.message), 'error');
            }
        }

        insertAllTurns() {
            const lines = this.turns
                .filter(turn => turn.text.trim())
                .map(turn => `${turn.role === 'user' ? translateUi("我") : 'AI'}：${turn.text.trim()}`);
            if (!lines.length) return;
            this.insertTurnText(lines.join('\n'));
        }

        renderTranscript() {
            if (!this.transcriptEl) return;
            const nearBottom = this.transcriptEl.scrollHeight - this.transcriptEl.scrollTop - this.transcriptEl.clientHeight < 60;
            this.transcriptEl.replaceChildren();
            const visible = this.turns.filter(t => t.text || t.stash);
            if (visible.reduce((total, turn) => total + turn.text.length + turn.stash.length, 0) > 262144 && this.isCallActive()) {
                this.hangup(); this.setStatus('error', translateUi('通话记录已达上限，请保存记录后清空'));
            }
            if (!visible.length) {
                this.transcriptEl.append(node('p', 'pi-rtv-empty', translateUi("通话开始后，你的语音识别字幕与 AI 回复会实时显示在这里。需要保留的内容可加入主草稿。")));
                return;
            }
            for (const turn of visible) {
                const card = node('article', `pi-rtv-turn ${turn.role === 'user' ? 'is-user' : 'is-assistant'}`);
                const head = node('div', 'pi-rtv-turn-head');
                head.append(node('strong', '', turn.role === 'user' ? translateUi("你") : 'AI'));
                if (turn.text.trim()) {
                    const insertBtn = node('button', 'pi-rtv-turn-insert', translateUi("加入草稿"));
                    insertBtn.type = 'button';
                    insertBtn.addEventListener('click', () => this.insertTurnText(turn.text));
                    head.append(insertBtn);
                }
                const body = node('div', 'pi-rtv-turn-body', turn.text);
                if (turn.stash) body.append(node('span', 'pi-rtv-turn-stash', turn.stash));
                card.append(head, body);
                this.transcriptEl.append(card);
            }
            if (nearBottom) this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
        }

        cleanupMediaAndSocket() {
            clearInterval(this.timer);
            this.timer = null;
            this.stopPlayback();
            stopTracks(this.stream);
            this.stream = null;
            try { this.micSource?.disconnect(); } catch {}
            try { this.processor?.disconnect(); } catch {}
            try { this.muteGain?.disconnect(); } catch {}
            if (this.processor) this.processor.onaudioprocess = null;
            this.micSource = this.processor = this.muteGain = null;
            const ctx = this.audioCtx;
            this.audioCtx = null;
            if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});

            for (const pending of this.pendingRequests.values()) {
                clearTimeout(pending.timer);
                pending.reject(new Error(translateUi("通话已结束")));
            }
            this.pendingRequests.clear();

            const ws = this.socket;
            this.socket = null;
            if (ws) {
                try {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ id: `rtv-close-${++this.nextReqId}`, type: 'close_realtime_voice' }));
                        ws.close(1000, 'Hangup');
                    } else if (ws.readyState === WebSocket.CONNECTING) {
                        ws.close();
                    }
                } catch {}
            }
            this.responding = false;
        }

        hangup() {
            const wasActive = this.isCallActive();
            this.epoch++;
            this.cleanupMediaAndSocket();
            if (wasActive) this.setStatus('idle', translateUi("实时语音通话已挂断。"));
            else this.sync();
        }
    }

    window.PiRealtimeVoice = PiRealtimeVoice;
    window.PiRealtimeVoice.PcmResampler = PcmResampler;
    window.PiRealtimeVoice.downsamplePcm16 = downsamplePcm16;
    window.PiRealtimeVoice.base64ToFloat32 = base64ToFloat32;
})();
