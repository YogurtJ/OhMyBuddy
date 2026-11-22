const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { once } = require('node:events');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omb-model-probe-'));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_OFFLINE = '1';
const { PiSettingsService } = require('../server/pi-settings-service');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('model probes use supported reasoning and never send an implicit none to a reasoning-only Responses endpoint', async t => {
    const requests = [];
    const endpoint = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); requests.push(body);
        assert.equal(req.url, '/v1/responses');
        assert.equal(req.headers.authorization, 'Bearer synthetic-probe-key');
        const allowed = body.model === 'mapped' ? ['minimal'] : body.model === 'only-high' ? ['high'] : body.model === 'plain' ? [undefined] : ['low'];
        if (!allowed.includes(body.reasoning?.effort)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: { code: 'unsupported_value', message: "Unsupported value: 'none'. Supported values are: 'low'." } }));
        }
        assert.equal(body.max_output_tokens, 64);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = event => res.write('data: ' + JSON.stringify(event) + '\n\n');
        const item = { id: 'msg-probe', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] };
        send({ type: 'response.created', response: { id: 'resp-probe', status: 'in_progress', output: [] } });
        send({ type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } });
        send({ type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: item.id, delta: 'OK' });
        send({ type: 'response.output_item.done', output_index: 0, item });
        send({ type: 'response.completed', response: { id: 'resp-probe', status: 'completed', output: [item], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } });
        res.end();
    });
    endpoint.listen(0, '127.0.0.1'); await once(endpoint, 'listening');
    t.after(async () => { endpoint.closeAllConnections(); await new Promise(resolve => endpoint.close(resolve)); });
    const service = new PiSettingsService({ cwd: root });
    await service.createCustomProvider({ id: 'probe-fixture', name: 'Probe fixture', api: 'openai-responses', baseUrl: `http://127.0.0.1:${endpoint.address().port}/v1`, apiKey: 'synthetic-probe-key', models: [
        { id: 'gpt-6.2-sol', reasoning: true, thinkingLevelMap: {} },
        { id: 'gpt-6.2-astra', reasoning: true },
        { id: 'mapped', reasoning: true, thinkingLevelMap: { low: 'minimal', minimal: null } },
        { id: 'only-high', reasoning: true, thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: 'high' } },
        { id: 'plain', reasoning: false }
    ] });
    const modelsBefore = fs.readFileSync(path.join(root, 'models.json'));
    const settingsFile = path.join(root, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ defaultThinkingLevel: 'high', modelThinkingLevels: { 'probe-fixture/gpt-6.2-sol': 'medium' }, futureSetting: 'keep' }));
    const settingsBefore = fs.readFileSync(settingsFile);
    const runtime = await service.createModelRuntime();
    const rejected = await runtime.completeSimple(runtime.getModel('probe-fixture', 'gpt-6.2-sol'), { messages: [{ role: 'user', content: 'Synthetic only', timestamp: 1 }] }, { maxTokens: 64 });
    assert.equal(rejected.stopReason, 'error');
    assert.equal(requests.length, 1, 'a rejected request is not replayed');
    assert.equal(requests[0].reasoning.effort, 'none', 'negative control reproduces the reported error');
    for (const modelId of ['gpt-6.2-sol', 'gpt-6.2-astra', 'mapped', 'only-high', 'plain']) {
        const result = await service.testModel({ provider: 'probe-fixture', modelId });
        assert.equal(result.ok, true); assert.equal(result.text, 'OK');
    }
    assert.deepEqual(requests.slice(1).map(body => body.reasoning?.effort), ['low', 'low', 'minimal', 'high', undefined]);
    assert.equal(requests.length, 6);
    assert.deepEqual(fs.readFileSync(path.join(root, 'models.json')), modelsBefore);
    assert.deepEqual(fs.readFileSync(settingsFile), settingsBefore);
});
