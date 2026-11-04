'use strict';
// Read-only model discovery for user-configured chat services. Each page is one GET to
// the configured origin: redirects are refused, bodies are bounded, and the key is only
// sent as a request header. Nothing here saves configuration or calls a model.
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_ERROR_BYTES = 16 * 1024;
const MAX_MODELS = 3000;
const MAX_PAGES = 5;
const REQUEST_TIMEOUT_MS = 15000;
const TOTAL_TIMEOUT_MS = 40000;
const DEFAULTS = { contextWindow: 128000, maxTokens: 16384 };
const LIMITS = { contextWindow: [1024, 4000000], maxTokens: [1, 1000000] };
// Built-in catalog entries from these providers describe the original model best.
const PREFERRED_CATALOG = ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'mistral', 'moonshotai', 'zai', 'minimax', 'xiaomi', 'meta', 'qwen-token-plan'];
const RESERVED_IDS = new Set(['__proto__', 'prototype', 'constructor']);

class DiscoveryFailure extends Error {
    constructor(reason, extra = {}) { super(reason); this.reason = reason; Object.assign(this, extra); }
}

function positive(value) {
    const number = typeof value === 'string' && /^\d{1,12}$/.test(value) ? Number(value) : value;
    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}
function firstPositive(...values) {
    for (const value of values) { const number = positive(value); if (number) return number; }
    return undefined;
}
function clamp(value, [minimum, maximum]) { return Math.min(maximum, Math.max(minimum, value)); }
function lowerList(value) { return Array.isArray(value) ? value.filter(item => typeof item === 'string').map(item => item.toLowerCase()) : []; }
function validModelId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 500 && !/[\u0000-\u0020\u007f]/.test(value) && !RESERVED_IDS.has(value);
}

// Name rules are the last resort after service metadata and the built-in catalog.
const NAME_RULES = [
    ['realtime', /realtime/],
    ['embedding', /embed|(^|[-_/.])(bge|gte|m3e)([-_/.]|$)/],
    ['rerank', /rerank/],
    ['moderation', /moderation/],
    ['asr', /whisper|transcri|(^|[-_/.])(asr|stt)([-_/.]|$)|paraformer|sensevoice|speech-to-text/],
    ['tts', /(^|[-_/.])tts([-_/.]|$)|text-to-speech|cosyvoice|sambert|(^|[-_/.])speech-\d/],
    ['video', /(^|[-_/.])(sora|veo|seedance|kling|hailuo|vidu|cogvideox?|pixverse|runway)|(^|[-_/.])video([-_/.]|$)|(^|[-_/.])(t2v|i2v)([-_/.]|$)/],
    ['image', /dall-e|gpt-image|imagen|flux|seedream|stable-diffusion|sdxl|midjourney|cogview|wanx|kolors|recraft|ideogram|(^|[-_/.])image([-_/.]|$)|(^|[-_/.])t2i([-_/.]|$)/]
];
const TYPE_KINDS = { chat: 'chat', language: 'chat', code: 'chat', image: 'image', video: 'video', embedding: 'embedding', embeddings: 'embedding',
    rerank: 'rerank', moderation: 'moderation', audio: 'tts', tts: 'tts', transcribe: 'asr', transcription: 'asr', asr: 'asr', stt: 'asr' };

function serviceKind(item) {
    const output = lowerList(item.architecture?.output_modalities ?? item.output_modalities ?? item.modalities?.output);
    if (output.length) {
        if (output.includes('image')) return 'image';
        if (output.includes('video')) return 'video';
        if (output.some(value => value.startsWith('embedding'))) return 'embedding';
        if (output.includes('text')) return 'chat';
        if (output.includes('audio')) return 'tts';
    }
    const endpoints = lowerList(item.supported_endpoint_types);
    if (endpoints.length) {
        if (endpoints.some(value => value.includes('image'))) return 'image';
        if (endpoints.some(value => value.includes('video'))) return 'video';
        if (endpoints.some(value => value.includes('embed'))) return 'embedding';
        if (endpoints.some(value => value.includes('rerank'))) return 'rerank';
        if (endpoints.some(value => ['openai', 'anthropic', 'gemini', 'openai-response', 'openai-responses', 'chat'].includes(value))) return 'chat';
    }
    const methods = lowerList(item.supportedGenerationMethods);
    // generateContent also covers Gemini image and speech variants; their names decide.
    if (methods.length && !methods.includes('generatecontent')) {
        if (methods.includes('predictlongrunning')) return 'video';
        if (methods.includes('predict')) return 'image';
        if (methods.some(value => value.startsWith('embed'))) return 'embedding';
        if (methods.includes('bidigeneratecontent')) return 'realtime';
    }
    return typeof item.type === 'string' ? TYPE_KINDS[item.type.toLowerCase()] || null : null;
}

function catalogKind(model) {
    return model.type === 'image' ? 'image' : model.type === 'classifier' ? 'moderation' : 'chat';
}
// Exact IDs only; the last path segment covers relays that add or drop a vendor prefix.
function buildCatalog(models, providerIds = []) {
    const rank = provider => { const index = PREFERRED_CATALOG.indexOf(provider); return index < 0 ? PREFERRED_CATALOG.length : index; };
    const byId = new Map(), bySuffix = new Map();
    for (const model of models) {
        if (!model || typeof model.id !== 'string') continue;
        const entry = { provider: model.provider, kind: catalogKind(model), name: typeof model.name === 'string' ? model.name : model.id,
            contextWindow: positive(model.contextWindow), maxTokens: positive(model.maxTokens),
            imageInput: Array.isArray(model.input) && model.input.includes('image'), reasoning: Boolean(model.reasoning) };
        for (const [map, key] of [[byId, model.id], [bySuffix, model.id.split('/').pop()]]) {
            const previous = map.get(key);
            if (!previous || rank(entry.provider) < rank(previous.provider)) map.set(key, entry);
        }
    }
    return {
        providers: new Set(providerIds),
        lookup(id) { return byId.get(id) || bySuffix.get(id.split('/').pop()) || null; }
    };
}

function chatMetadata(item, entry) {
    const top = item.top_provider && typeof item.top_provider === 'object' ? item.top_provider : {};
    const remoteContext = firstPositive(item.context_length, item.context_window, item.contextWindow, item.max_context_length,
        item.max_model_len, item.inputTokenLimit, item.input_token_limit, item.max_input_tokens, top.context_length);
    const remoteOutput = firstPositive(top.max_completion_tokens, item.max_completion_tokens, item.max_output_tokens,
        item.outputTokenLimit, item.output_token_limit);
    const inputs = lowerList(item.architecture?.input_modalities ?? item.input_modalities ?? item.modalities?.input);
    const parameters = lowerList(item.supported_parameters);
    const contextWindow = clamp(remoteContext ?? entry?.contextWindow ?? DEFAULTS.contextWindow, LIMITS.contextWindow);
    const maxTokens = clamp(Math.min(remoteOutput ?? entry?.maxTokens ?? DEFAULTS.maxTokens, contextWindow), LIMITS.maxTokens);
    const imageInput = inputs.length ? inputs.includes('image') : Boolean(entry?.imageInput);
    const reasoning = parameters.length ? parameters.includes('reasoning') || parameters.includes('include_reasoning')
        : typeof item.thinking === 'boolean' ? item.thinking : Boolean(entry?.reasoning);
    const metadata = remoteContext ? 'service' : entry?.contextWindow ? 'catalog' : 'default';
    return { contextWindow, maxTokens, imageInput, reasoning, metadata };
}

function describeModel(id, item, catalog) {
    const entry = catalog?.lookup(id) || null;
    let kind = serviceKind(item), kindSource = 'service';
    if (!kind && entry) { kind = entry.kind; kindSource = 'catalog'; }
    if (!kind) {
        const rule = NAME_RULES.find(([, pattern]) => pattern.test(id.toLowerCase()));
        if (rule) { kind = rule[0]; kindSource = 'name'; }
    }
    if (!kind) { kind = 'chat'; kindSource = 'default'; }
    const label = [item.display_name, item.displayName, typeof item.name === 'string' && item.name !== id && !item.name.startsWith('models/') ? item.name : null, entry?.name]
        .find(value => typeof value === 'string' && value.trim() && value.length <= 200);
    const model = { id, name: label ? label.trim() : id, kind, kindSource };
    return kind === 'chat' ? { ...model, ...chatMetadata(item, entry || {}) } : model;
}

function itemsOf(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    for (const key of ['data', 'models', 'items', 'result']) if (Array.isArray(data[key])) return data[key];
    return Array.isArray(data.data?.models) ? data.data.models : null;
}

function normalizeModels(api, items, catalog) {
    const seen = new Set(), models = [];
    for (const item of items) {
        const fields = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
        let id = typeof item === 'string' ? item : [fields.id, fields.model, fields.name, fields.model_id].find(value => typeof value === 'string' && value);
        if (typeof id !== 'string') continue;
        if (api === 'google-generative-ai' || id.startsWith('models/')) id = id.replace(/^models\//, '');
        if (!validModelId(id) || seen.has(id)) continue;
        seen.add(id);
        models.push(describeModel(id, fields, catalog));
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
}

function modelsUrl(api, baseUrl) {
    const base = baseUrl.replace(/\/+$/, '');
    const url = new URL(api === 'anthropic-messages' ? `${base}/v1/models` : `${base}/models`);
    if (api === 'google-generative-ai') url.searchParams.set('pageSize', '1000');
    if (api === 'anthropic-messages') url.searchParams.set('limit', '1000');
    return url;
}

// Mirror how Pi sends the key for each protocol; configured provider headers come first.
function requestHeaders(api, apiKey, authHeader, extra = {}) {
    const headers = { Accept: 'application/json' };
    for (const [name, value] of Object.entries(extra || {})) if (typeof value === 'string' && /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(name)) headers[name] = value;
    if (!apiKey) return headers;
    if (api === 'anthropic-messages') {
        headers['x-api-key'] = apiKey; headers['anthropic-version'] = '2023-06-01';
        if (authHeader) headers.Authorization = `Bearer ${apiKey}`;
    } else if (api === 'google-generative-ai') {
        headers['x-goog-api-key'] = apiKey;
        if (authHeader) headers.Authorization = `Bearer ${apiKey}`;
    } else headers.Authorization = `Bearer ${apiKey}`;
    return headers;
}

function discard(response) { try { response.body?.destroy?.(); } catch { /* Already closed. */ } }
async function readBounded(response, maximum, signal) {
    const declared = Number(response.headers?.get?.('content-length'));
    if (declared > maximum) { discard(response); throw new DiscoveryFailure('too_large'); }
    if (!response.body) return Buffer.alloc(0);
    const chunks = []; let length = 0;
    try {
        for await (const chunk of response.body) {
            length += chunk.length;
            if (length > maximum) { discard(response); throw new DiscoveryFailure('too_large'); }
            chunks.push(Buffer.from(chunk));
        }
    } catch (error) {
        if (error instanceof DiscoveryFailure) throw error;
        throw new DiscoveryFailure(signal?.aborted ? 'timeout' : error?.type === 'max-size' ? 'too_large' : 'network');
    }
    return Buffer.concat(chunks);
}

function redact(text, secrets) {
    let result = String(text || '');
    for (const secret of secrets) result = result.split(secret).join('***');
    return result.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 300);
}
async function errorDetail(response, secrets, signal) {
    let bytes;
    try { bytes = await readBounded(response, MAX_ERROR_BYTES, signal); } catch { return ''; }
    const text = bytes.toString('utf8');
    try {
        const data = JSON.parse(text);
        const value = [data?.error?.message, data?.message, typeof data?.error === 'string' ? data.error : null, data?.detail].find(item => typeof item === 'string' && item);
        return redact(value || '', secrets);
    } catch { return redact(text.split('\n')[0], secrets); }
}

async function getJson(fetch, url, headers, total, secrets) {
    const signal = AbortSignal.any([total, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
    let response;
    try { response = await fetch(url.href, { method: 'GET', headers, redirect: 'manual', follow: 0, size: MAX_PAGE_BYTES, signal }); }
    catch { throw new DiscoveryFailure(signal.aborted ? 'timeout' : 'network'); }
    const status = response.status;
    if (status >= 300 && status < 400) { discard(response); throw new DiscoveryFailure('redirect', { httpStatus: status }); }
    if (!response.ok) {
        const detail = await errorDetail(response, secrets, signal);
        const reason = status === 401 || status === 403 ? 'auth' : status === 404 || status === 405 ? 'not_found' : 'http';
        throw new DiscoveryFailure(reason, { httpStatus: status, detail });
    }
    const bytes = await readBounded(response, MAX_PAGE_BYTES, signal);
    try { return JSON.parse(bytes.toString('utf8')); } catch { throw new DiscoveryFailure('invalid'); }
}

async function discoverModels({ api, baseUrl, apiKey = '', authHeader = false, headers = {}, fetch, catalog }) {
    const secrets = [apiKey, ...Object.values(headers || {})].filter(value => typeof value === 'string' && value.length >= 4);
    const sent = requestHeaders(api, apiKey, authHeader, headers);
    let url = modelsUrl(api, baseUrl);
    const endpoint = url.origin + url.pathname;
    const total = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
    const items = [];
    let truncated = false;
    try {
        for (let page = 0; ; page++) {
            const data = await getJson(fetch, url, sent, total, secrets);
            const batch = itemsOf(data);
            if (!batch) throw new DiscoveryFailure('invalid');
            items.push(...batch);
            let next = null;
            if (api === 'google-generative-ai' && typeof data.nextPageToken === 'string' && data.nextPageToken) {
                next = new URL(url); next.searchParams.set('pageToken', data.nextPageToken);
            } else if (api === 'anthropic-messages' && data.has_more === true && typeof data.last_id === 'string' && data.last_id) {
                next = new URL(url); next.searchParams.set('after_id', data.last_id);
            }
            if (items.length > MAX_MODELS || (next && page + 1 >= MAX_PAGES)) { truncated = true; break; }
            if (!next) break;
            url = next;
        }
    } catch (error) {
        if (!(error instanceof DiscoveryFailure)) throw error;
        return { ok: false, reason: error.reason, httpStatus: error.httpStatus ?? null, detail: error.detail || '', endpoint };
    }
    const models = normalizeModels(api, items.slice(0, MAX_MODELS), catalog);
    return { ok: true, endpoint, truncated, models };
}

function slug(value) {
    return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}
// IDs come from the display name, or the host when the name has no Latin letters.
function providerIdFor(name, baseUrl, taken) {
    let base = slug(name);
    if (!base) {
        const host = new URL(baseUrl).hostname.replace(/^(www|api)\./, '').replace(/\.(com|cn|net|org|io|ai|dev|app|co|top|xyz|cc|me|tech|cloud)(\.cn)?$/, '');
        base = slug(host);
    }
    if (!base) base = 'custom';
    if (!/^[a-z]/.test(base)) base = `custom-${base}`;
    let id = base;
    if (taken(id)) id = `${base}-custom`;
    for (let suffix = 2; taken(id); suffix++) id = `${base}-${suffix}`;
    return id;
}

module.exports = { discoverModels, buildCatalog, describeModel, normalizeModels, providerIdFor, requestHeaders, modelsUrl,
    DEFAULTS, LIMITS, MAX_MODELS, clamp, positive, RESERVED_IDS };
