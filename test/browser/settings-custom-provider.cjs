const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.PI_CUSTOM_PROVIDER_TEST_URL || 'http://127.0.0.1:3001';
const cwd = '/srv/custom-provider-fixture';
const fields = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),textarea,select';

function discovered(added = []) {
    const chat = (id, extra = {}) => ({ id, name: id, kind: 'chat', kindSource: 'default', contextWindow: 128000, maxTokens: 16384, imageInput: false, reasoning: false, metadata: 'default', ...extra });
    const models = [
        chat('gpt-5.4-mini', { kindSource: 'catalog', contextWindow: 400000, maxTokens: 128000, imageInput: true, reasoning: true, metadata: 'catalog' }),
        ...Array.from({ length: 180 }, (_, index) => chat(`relay-model-${index}`)),
        { id: 'gpt-image-2', name: 'gpt-image-2', kind: 'image', kindSource: 'name' },
        { id: 'sora-2', name: 'sora-2', kind: 'video', kindSource: 'name' },
        { id: 'tts-1', name: 'tts-1', kind: 'tts', kindSource: 'name' },
        { id: 'whisper-1', name: 'whisper-1', kind: 'asr', kindSource: 'name' },
        { id: 'text-embedding-3-large', name: 'text-embedding-3-large', kind: 'embedding', kindSource: 'name' }
    ].map(model => added.includes(model.id) ? { ...model, added: true } : model);
    return { ok: true, endpoint: 'https://relay.example.com/v1/models', truncated: false, models: models.sort((a, b) => a.id.localeCompare(b.id)) };
}

function initialCatalog() {
    return { revision: 'r1', providerLogin: true, modelThinking: true, thinkingMapKeys: [],
        providers: [{ id: 'openai', name: 'OpenAI', configured: false, authMethods: { apiKey: true, apiKeyLogin: true }, modelCount: 0 }],
        models: [], preferences: { defaultProvider: '', defaultModel: '', modelThinkingLevels: {}, mediaAgent: { provider: '', modelId: '' } }, customProviders: [] };
}

async function run(browser, viewport, locale) {
    const english = locale === 'en';
    const mobile = viewport.width < 900;
    const context = await browser.newContext({ locale, viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = [], writes = [];
    let catalog = initialCatalog(), draftFailures = 1;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(language => localStorage.setItem('pi.workspace.language', language), locale);
    await page.route('**/api/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        if (req.method() !== 'GET') {
            const body = req.postData() ? req.postDataJSON() : null;
            writes.push({ path, body });
            if (path === '/api/pi/settings/custom-providers/discover-models') {
                if (draftFailures-- > 0) return route.fulfill({ json: { ok: false, reason: 'auth', httpStatus: 401, detail: 'Invalid key ***', endpoint: 'https://relay.example.com/v1/models' } });
                return route.fulfill({ json: { ...discovered(), providerId: null, keyUsed: true } });
            }
            if (path === '/api/pi/settings/custom-providers/browser-relay/discover-models') return route.fulfill({ json: { ...discovered(['gpt-5.4-mini']), providerId: 'browser-relay', keyUsed: true } });
            if (path === '/api/pi/settings/custom-providers/setup') {
                const models = body.models.map(model => ({ provider: 'browser-relay', id: model.id, name: model.name || model.id, available: true, input: model.imageInput ? ['text', 'image'] : ['text'], reasoning: model.reasoning, contextWindow: model.contextWindow }));
                catalog = { ...catalog, providers: [...catalog.providers, { id: 'browser-relay', name: body.name, configured: true, authMethods: { apiKey: true, apiKeyLogin: true }, storedCredential: 'api_key', modelCount: models.length }],
                    models: [...catalog.models, ...models], customProviders: [{ id: 'browser-relay', name: body.name, api: body.api, baseUrl: body.baseUrl, models }] };
                return route.fulfill({ json: { ok: true, providerId: 'browser-relay', modelCount: models.length, credential: 'saved', requiresRuntimeRestart: true } });
            }
            if (path === '/api/pi/settings/custom-providers/browser-relay/models/batch') {
                const models = body.models.map(model => ({ provider: 'browser-relay', id: model.id, name: model.id, available: true, input: ['text'], contextWindow: model.contextWindow }));
                catalog = { ...catalog, models: [...catalog.models, ...models], customProviders: [{ ...catalog.customProviders[0], models: [...catalog.customProviders[0].models, ...models] }] };
                return route.fulfill({ json: { ok: true, providerId: 'browser-relay', modelCount: models.length } });
            }
            return route.fulfill({ json: { ok: true } });
        }
        if (path === '/api/pi/status') return route.fulfill({ json: { ok: true, projectRoots: ['/srv'] } });
        if (path === '/api/pi/projects') return route.fulfill({ json: { projects: [{ cwd, name: 'Provider fixture', sessionCount: 0 }], roots: ['/srv'] } });
        if (path === '/api/pi/sessions') return route.fulfill({ json: { sessions: [] } });
        if (path === '/api/pi/settings/models') return route.fulfill({ json: catalog });
        if (path === '/api/pi/activity') return route.fulfill({ json: { runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] } });
        if (path.includes('history') || path === '/api/prompts') return route.fulfill({ json: [] });
        return route.fulfill({ json: {} });
    });
    await page.routeWebSocket('**/api/pi/ws', () => { throw new Error('Provider settings must not open a session'); });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#workspace-settings-toggle').click();
    await page.locator('[data-settings-tab="providers"]').click();
    await page.locator('#settings-model-list .settings-model-group').first().waitFor();
    const overflow = async selectors => {
        for (const selector of selectors) {
            const metric = await page.locator(selector).first().evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth, right: el.getBoundingClientRect().right }));
            assert.ok(metric.scroll - metric.client <= 1, `${viewport.width} ${selector} overflows: ${JSON.stringify(metric)}`);
            assert.ok(metric.right <= viewport.width + 1, `${viewport.width} ${selector} exceeds viewport: ${JSON.stringify(metric)}`);
        }
    };
    const smallFields = selector => page.locator(selector).evaluateAll(elements => elements.filter(el => el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 16).map(el => el.name || el.placeholder || el.tagName));

    await page.locator('#settings-add-provider').click();
    const form = page.locator('#settings-provider-form');
    assert.equal(await page.locator('#workspace-settings-editor-title').textContent(), english ? 'Add custom provider' : '添加自定义服务商');
    assert.equal((await page.locator('#settings-add-provider').textContent()).trim(), english ? 'Add custom provider' : '添加自定义服务商');
    await form.locator('[name=name]').fill('Browser Relay');
    await form.locator('[name=baseUrl]').fill('https://relay.example.com/v1');
    await form.locator('[name=apiKey]').fill('sk-browser-fixture');
    const fetchButton = form.locator('[data-cps-fetch]');
    assert.equal((await fetchButton.textContent()).trim(), english ? 'Fetch available models' : '获取可用模型');
    await form.locator('[type=submit]').click();
    await form.locator('.cps-error').filter({ hasText: english ? 'Add at least one model' : '请至少添加一个模型' }).waitFor();
    assert.equal(writes.length, 0, 'an empty model list is rejected before any request');

    await fetchButton.click();
    await form.locator('.cps-status[data-tone="error"]').filter({ hasText: english ? 'rejected this API key' : '拒绝了这个 API Key' }).waitFor();
    assert.ok((await form.locator('.cps-status').textContent()).includes('Invalid key ***'));
    assert.deepEqual(writes.at(-1), { path: '/api/pi/settings/custom-providers/discover-models',
        body: { api: 'openai-completions', baseUrl: 'https://relay.example.com/v1', apiKey: 'sk-browser-fixture', authHeader: false } });
    await fetchButton.click();
    const picker = page.locator('dialog.cps-picker[open]');
    await picker.waitFor();
    if (mobile) assert.deepEqual(await smallFields('#settings-provider-form ' + fields.split(',').join(', #settings-provider-form ')), []);
    assert.equal(await picker.locator('input[type=checkbox]:checked').count(), 0, 'nothing is selected by default');
    assert.equal(await picker.locator('.cps-picker-actions .settings-primary-button').isDisabled(), true);
    const tabs = await picker.locator('.cps-tab').allTextContents();
    assert.deepEqual(tabs, english ? ['Chat models 181', 'Image 1', 'Video 1', 'Speech synthesis 1', 'Speech recognition 1', 'Other 1'] : ['对话模型 181', '图像 1', '视频 1', '语音合成 1', '语音识别 1', '其他 1']);
    assert.equal(await picker.locator('.cps-row').count(), 150, 'long lists render in pages');
    await picker.locator('.cps-more').click();
    assert.equal(await picker.locator('.cps-row').count(), 181);
    const search = picker.locator('.cps-picker-search');
    if (mobile) assert.deepEqual(await smallFields('dialog.cps-picker input:not([type=checkbox])'), []);
    await search.fill('relay-model-17');
    assert.equal(await picker.locator('.cps-row').count(), 11);
    const selectAll = picker.locator('.cps-picker-toolbar button');
    await selectAll.click();
    assert.equal(await picker.locator('.cps-picker-count').textContent(), english ? '11 selected' : '已选 11 个');
    await selectAll.click();
    assert.equal(await picker.locator('input[type=checkbox]:checked').count(), 0);
    await search.fill('');
    await picker.locator('.cps-row:has(code:text-is("gpt-5.4-mini")) input').check();
    await picker.locator('.cps-tab[data-group="image"]').click();
    assert.equal(await picker.locator('input[type=checkbox]').count(), 0, 'non-chat models cannot be added to the chat catalog');
    assert.ok((await picker.locator('.cps-picker-note').textContent()).includes(english ? 'Models & capabilities' : '模型与能力'));
    await picker.locator('.cps-row:has(code:text-is("gpt-image-2")) .cps-move').click();
    assert.equal(await picker.locator('.cps-row').count(), 0, 'a moved model leaves its media tab');
    await picker.locator('.cps-tab[data-group="other"]').click();
    assert.equal(await picker.locator('.cps-row:has(code:text-is("text-embedding-3-large")) .settings-badge').textContent(), english ? 'Embedding' : '向量');
    await overflow(['dialog.cps-picker', '.cps-picker-list']);
    if (viewport.width === 1440 && !english) await page.screenshot({ path: '/tmp/omb-custom-provider-picker-1440.png' });
    if (viewport.width === 393) await page.screenshot({ path: '/tmp/omb-custom-provider-picker-393.png' });
    await picker.locator('.cps-picker-actions .settings-primary-button').click();
    await picker.waitFor({ state: 'detached' });

    const rows = form.locator('.cps-selected-row');
    assert.equal(await rows.count(), 2);
    const mini = rows.filter({ has: page.locator('code:text-is("gpt-5.4-mini")') });
    assert.ok((await mini.textContent()).includes(english ? 'Context 400k' : '上下文 400k'));
    assert.ok((await rows.filter({ has: page.locator('code:text-is("gpt-image-2")') }).textContent()).includes(english ? 'Default values' : '默认值'));
    await form.locator('.cps-manual input').fill('manual-model');
    await form.locator('.cps-manual input').press('Enter');
    assert.equal(await rows.count(), 3);
    await rows.filter({ has: page.locator('code:text-is("gpt-image-2")') }).locator('.icon-btn').click();
    assert.equal(await rows.count(), 2);
    await form.locator('.cps-fetch button:not([data-cps-fetch])').click();
    await picker.waitFor();
    assert.equal(await picker.locator('.cps-row:has(code:text-is("gpt-5.4-mini")) input').isChecked(), true, 'reopening keeps the current selection');
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached' });
    assert.equal(await page.locator('#workspace-settings-editor').isHidden(), false, 'Escape closes only the picker');
    await mini.locator('summary').click();
    await mini.locator('input[type=number]').first().fill('272000');
    await mini.locator('input[type=number]').first().dispatchEvent('change');
    await overflow(['.settings-editor-dialog', '#workspace-settings-editor-body', '#settings-provider-form']);
    if (viewport.width === 393) await page.screenshot({ path: '/tmp/omb-custom-provider-form-393.png' });
    await form.locator('[type=submit]').click();
    await page.locator('#workspace-settings-editor').waitFor({ state: 'hidden' });
    assert.deepEqual(writes.at(-1), { path: '/api/pi/settings/custom-providers/setup', body: {
        name: 'Browser Relay', baseUrl: 'https://relay.example.com/v1', api: 'openai-completions', apiKey: 'sk-browser-fixture', authHeader: false,
        models: [{ id: 'gpt-5.4-mini', contextWindow: 272000, maxTokens: 128000, imageInput: true, reasoning: true },
            { id: 'manual-model', contextWindow: 128000, maxTokens: 16384, imageInput: false, reasoning: false }] } });
    await page.locator('.pi-toast').filter({ hasText: 'Browser Relay' }).first().waitFor();
    const group = page.locator('.settings-model-group').filter({ has: page.locator('summary[data-provider="browser-relay"]') });
    await group.locator('.model-row').first().waitFor();
    assert.equal(await group.evaluate(el => el.open), true, 'the new provider is expanded after creation');
    assert.equal(await group.locator('.model-row').count(), 2);

    await group.locator('.provider-row [data-action="add-model"]').click();
    await picker.waitFor();
    assert.equal(writes.at(-1).path, '/api/pi/settings/custom-providers/browser-relay/discover-models', 'existing providers fetch with the saved key');
    const added = picker.locator('.cps-row:has(code:text-is("gpt-5.4-mini")) input');
    assert.deepEqual([await added.isChecked(), await added.isDisabled()], [true, true]);
    await picker.locator('.cps-row:has(code:text-is("relay-model-1")) input').check();
    await picker.locator('.cps-picker-actions .settings-primary-button').click();
    await picker.waitFor({ state: 'detached' });
    await page.locator('#settings-add-models-form [type=submit]').click();
    await page.locator('#workspace-settings-editor').waitFor({ state: 'hidden' });
    assert.deepEqual(writes.at(-1), { path: '/api/pi/settings/custom-providers/browser-relay/models/batch',
        body: { models: [{ id: 'relay-model-1', contextWindow: 128000, maxTokens: 16384, imageInput: false, reasoning: false }] } });
    await group.locator('.model-row[data-model-id="relay-model-1"]').waitFor();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ viewport, locale, writes: writes.length, errors }));
    await context.close();
}

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    try {
        for (const viewport of [{ width: 393, height: 852 }, { width: 1440, height: 1000 }]) await run(browser, viewport, 'zh-CN');
        await run(browser, { width: 1440, height: 1000 }, 'en');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
