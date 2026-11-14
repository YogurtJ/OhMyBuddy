const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { fixture } = require('./pi-startup-loading.cjs');
const base = process.env.PI_REALTIME_VOICE_URL || 'http://127.0.0.1:5199';
const provider = { id: 'qwen', name: 'Synthetic Qwen', baseUrl: 'https://token-plan.maas.qianwenaiapi.com', auth: { mode: 'bearer' }, models: [], keyConfigured: true };
const definition = { id: 'rt', providerId: 'qwen', name: 'Qwen Audio 3.0 Realtime', remoteModel: 'qwen-audio-3.0-realtime-plus', protocol: 'qwen-realtime', voice: 'longanqian', turnDetection: 'push_to_talk' };
const model = { id: 'realtime:qwen:rt', provider: 'qwen', name: definition.name, modelId: definition.remoteModel, voice: definition.voice, turnDetection: definition.turnDetection };
const catalog = { revision: 'rt-1', models: [model], maximumSeconds: 600 };
const settings = { revision: 'settings-1', providers: [provider], realtimeModels: [definition], availableModels: [model], realtimeProtocols: [{ id: 'qwen-realtime', name: '千问实时语音对话（WebSocket）' }] };
const pcm = Buffer.alloc(4800).toString('base64');
async function run(browser, width, language) {
    const calls = []; let upstream;
    const f = await fixture(browser, width, '#/chat', { base, onSocket(ws, cmd) {
        if (cmd.type === 'open_realtime_voice') {
            calls.push(cmd); upstream = ws;
            ws.send(JSON.stringify({ type: 'response', id: cmd.id, command: cmd.type, success: true, data: { outputSampleRate: 24000 } }));
            return true;
        }
        if (!cmd.type.startsWith('realtime_voice_') && cmd.type !== 'close_realtime_voice') return false;
        if (cmd.type !== 'realtime_voice_audio') calls.push(cmd);
        if (cmd.type === 'realtime_voice_audio') {
            assert.ok(Buffer.from(cmd.audio, 'base64').length > 0); return true;
        }
        ws.send(JSON.stringify({ type: 'response', id: cmd.id, command: cmd.type, success: true, data: {} }));
        return true;
    } });
    const { page, context } = f;
    await context.grantPermissions(['microphone'], { origin: base });
    await page.addInitScript(language => localStorage.setItem('pi.workspace.language', language), language);
    await page.route('**/api/pi/status', route => route.fulfill({ json: { ok: true, transcription: true, realtimeVoice: true, composerTools: true, defaultProject: '/synthetic/startup', projectRoots: ['/synthetic'] } }));
    await page.route('**/api/pi/composer/realtime-voice', route => route.fulfill({ json: catalog }));
    await page.route('**/api/pi/composer/realtime-voice/settings', route => route.fulfill({ json: settings }));
    await page.route('**/api/pi/composer/transcription', route => route.fulfill({ json: { revision: 'a', models: [] } }));
    await page.route('**/api/pi/composer/transcription/settings', route => route.fulfill({ json: { revision: 'asr', providers: [provider], availableModels: [], transcriptionModels: [], transcriptionProtocols: [{ id: 'openai', name: '音频转录接口' }, { id: 'qwen-asr', name: '千问原生语音识别' }] } }));
    await f.go();
    await page.waitForFunction(() => !document.querySelector('#pi-input').disabled && !document.querySelector('#pi-realtime-voice-button').disabled);
    await page.locator('#pi-input').fill('original draft');
    await page.locator('#pi-file-input').setInputFiles({ name: 'fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('keep this attachment') });
    await page.locator('#pi-attachments .pi-attachment-chip').waitFor();
    await page.locator('#pi-realtime-voice-button').click();
    const dialog = page.locator('#pi-realtime-voice-dialog');
    await dialog.waitFor({ state: 'visible' });
    const start = language === 'en' ? 'Start call' : '开始通话';
    await dialog.getByRole('button', { name: start, exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.pi-rtv-status-banner').dataset.phase === 'listening');
    assert.equal(calls[0].session.turnDetection, 'push_to_talk');
    assert.equal(calls[0].session.voice, 'longanqian');
    const push = event => upstream.send(JSON.stringify({ type: 'gateway_realtime_voice', event }));
    push({ type: 'conversation.item.input_audio_transcription.completed', itemId: 'u1', transcript: '<img src=x onerror="window.rtvXss=true">中文' });
    push({ type: 'response.created', responseId: 'r1' });
    push({ type: 'response.audio_transcript.delta', itemId: 'a1', responseId: 'r1', delta: 'Hello, ' });
    push({ type: 'response.audio_transcript.done', itemId: 'a1', responseId: 'r1', transcript: 'Hello, world.' });
    push({ type: 'response.audio.delta', itemId: 'a1', responseId: 'r1', delta: pcm });
    await dialog.locator('.pi-rtv-turn').nth(1).waitFor();
    assert.equal(await page.evaluate(() => Boolean(window.rtvXss)), false);
    assert.equal(await dialog.locator('.pi-rtv-transcript img').count(), 0);
    for (const theme of ['mint', 'dark']) {
        await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
        assert.deepEqual(await dialog.evaluate(el => [...el.querySelectorAll('*')].filter(e => e.clientWidth && e.scrollWidth > e.clientWidth + 1).map(e => e.className)), []);
    }
    if (process.env.PIVANE_TEST_SCREENSHOT_DIR) {
        const fs = require('node:fs'), path = require('node:path');
        fs.mkdirSync(process.env.PIVANE_TEST_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.PIVANE_TEST_SCREENSHOT_DIR, `voice-${width}-${language}.png`) });
    }
    await dialog.getByRole('button', { name: language === 'en' ? 'Interrupt' : '打断播报', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.pi-rtv-status-banner').dataset.phase === 'listening');
    push({ type: 'response.done', responseId: 'r1', status: 'cancelled' });
    await dialog.getByRole('button', { name: language === 'en' ? 'Mute' : '静音', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: language === 'en' ? 'Unmute' : '取消静音', exact: true }).count(), 1);
    await dialog.getByRole('button', { name: language === 'en' ? 'Send audio' : '说完发送', exact: true }).click();
    assert.ok(calls.some(c => c.type === 'realtime_voice_commit'));
    await dialog.getByRole('button', { name: language === 'en' ? 'End call' : '结束通话', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.pi-rtv-status-banner').dataset.phase === 'idle');
    if (width === 1440 && language === 'en') {
        await page.evaluate(async () => {
            window.lateMicrophoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.resolveLateMicrophone = () => resolve(window.lateMicrophoneStream); });
        });
        const opens = calls.filter(c => c.type === 'open_realtime_voice').length;
        await dialog.getByRole('button', { name: 'Start call', exact: true }).click();
        await page.waitForFunction(() => Boolean(window.resolveLateMicrophone));
        await dialog.getByRole('button', { name: 'End call', exact: true }).click();
        await page.evaluate(() => window.resolveLateMicrophone());
        await page.waitForFunction(() => window.lateMicrophoneStream.getTracks().every(t => t.readyState === 'ended'));
        assert.equal(calls.filter(c => c.type === 'open_realtime_voice').length, opens, 'cancelled permission never opens a remote call');
    }
    await dialog.getByRole('button', { name: language === 'en' ? 'Add transcript to main draft' : '将记录加入主草稿' }).click();
    assert.match(await page.locator('#pi-input').inputValue(), /original draft\n\n/);
    assert.match(await page.locator('#pi-input').inputValue(), /Hello, world\./);
    await dialog.getByRole('button', { name: language === 'en' ? 'Close window' : '关闭窗口', exact: true }).click();
    assert.equal(await page.locator('#pi-attachments .pi-attachment-chip').count(), 1);
    assert.ok(!f.commands.includes('prompt'), 'transcript never submits a main message');
    await page.evaluate(() => window.PiMediaConnections.open({ kind: 'tts', section: 'realtime', origin: 'settings' }));
    await page.locator('#settings-realtime-voice-model').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: language === 'en' ? 'Add realtime voice model' : '添加实时语音模型', exact: true }).click();
    const section = page.locator('#settings-realtime-voice');
    await section.getByLabel(language === 'en' ? 'Speech service' : '语音服务', { exact: true }).selectOption('qwen');
    assert.equal(await section.locator('input[type="password"]').isVisible(), false);
    const tabs = page.locator('#mc-speech-tabs');
    await page.locator('#mc-realtime-tab').focus(); await page.keyboard.press('Home');
    assert.equal(await page.locator('#mc-tts-tab').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    await page.locator('#settings-transcription-model').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: language === 'en' ? 'Add transcription model' : '添加转录模型', exact: true }).click();
    const asr = page.locator('#settings-speech');
    await asr.getByLabel(language === 'en' ? 'Speech service' : '语音服务', { exact: true }).selectOption('qwen');
    assert.equal(await asr.getByLabel(language === 'en' ? 'Transcription model ID' : '转录模型 ID', { exact: true }).inputValue(), 'qwen-audio-3.0-asr-flash');
    assert.equal(await asr.getByLabel(language === 'en' ? 'Transcription protocol' : '转录协议', { exact: true }).inputValue(), 'qwen-asr');
    assert.equal(await tabs.getByRole('tab').count(), 3);
    assert.deepEqual(await page.evaluate(() => ['body', '#lab-connections-dialog', '#settings-speech', '#pi-realtime-voice-dialog', '.pi-composer'].filter(selector => { const e = document.querySelector(selector); return e.clientWidth && e.scrollWidth > e.clientWidth + 1; })), []);
    assert.deepEqual(f.errors, []);
    if (width < 700) assert.ok(await asr.locator('input').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16));
    await context.close();
    console.log(`PASS realtime ${width} ${language}: duplex PCM, transcripts, interrupt, hangup, draft/attachment preservation, settings, ASR native protocol, no pageerror/overflow`);
}
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    try { for (const width of [1440, 393, 320]) for (const language of ['zh-CN', 'en']) await run(browser, width, language); }
    finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
