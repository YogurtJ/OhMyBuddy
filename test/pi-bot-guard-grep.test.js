const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createBotGrepExecutor, GREP_LIMITS } = require('../server/bot/bot-guard-grep');
const io = require('../server/pi-file-io');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-grep-')));
const agentDir = path.join(root, 'agent'), cwd = path.join(root, 'workspace');
for (const dir of [agentDir, cwd, path.join(cwd, 'nested'), path.join(cwd, '.git')]) fs.mkdirSync(dir);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root; process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(root, 'workspaces');
process.env.PI_OFFLINE = '1';
process.env.PI_TELEMETRY = '0';
const protectedMarker = `SYNTHETIC_PRIVATE_${randomBytes(16).toString('hex')}`;
for (const name of ['auth.json', '.env', 'nested/auth.json']) fs.writeFileSync(path.join(cwd, name), protectedMarker);
fs.writeFileSync(path.join(agentDir, 'private.json'), protectedMarker);
fs.writeFileSync(path.join(agentDir, 'linked.json'), protectedMarker);
fs.writeFileSync(path.join(cwd, 'safe.json'), 'before\nSafe needle value\nafter\n');
fs.writeFileSync(path.join(cwd, 'nested', 'safe.json'), 'safe NEEDLE second\n');
fs.writeFileSync(path.join(cwd, 'safe[1].txt'), 'literal [x] needle\n');
fs.writeFileSync(path.join(root, 'parent.txt'), 'parent needle\n');
fs.writeFileSync(path.join(cwd, '.gitignore'), '*.ignored\n');
fs.writeFileSync(path.join(cwd, 'skip.ignored'), 'ignored needle\n');
fs.symlinkSync(path.join(agentDir, 'private.json'), path.join(cwd, 'alias.json'));
fs.symlinkSync(agentDir, path.join(cwd, 'private-dir'));
fs.symlinkSync(path.join(cwd, 'safe.json'), path.join(cwd, 'safe-link.json'));
fs.linkSync(path.join(agentDir, 'linked.json'), path.join(cwd, 'hard.json'));
fs.symlinkSync(path.join(root, 'missing'), path.join(cwd, 'dangling.json'));
fs.symlinkSync(path.join(cwd, 'loop-b'), path.join(cwd, 'loop-a'));
fs.symlinkSync(path.join(cwd, 'loop-a'), path.join(cwd, 'loop-b'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const execute = createBotGrepExecutor(() => true, () => agentDir);
const run = (input, signal) => execute('test', input, signal, undefined, { cwd });
const text = result => result.content.map(item => item.text ?? '').join('\n');
function assertFiltered(result) {
    // Boolean assertions avoid printing even synthetic protected contents on failure.
    assert.ok(!JSON.stringify(result).includes(protectedMarker), 'protected fixture contents must never leave grep');
}

test('NB-01 actual managed grep filters protected descendants before content reads, including parent searches', async t => {
    const opened = [], open = io.openRead;
    t.mock.method(io, 'openRead', async filename => { opened.push(filename); return open(filename); });
    for (const input of [{ path: '.', glob: '*.json', pattern: '.' }, { path: '.', pattern: '.' }, { path: '..', pattern: '.' }]) {
        const result = await run(input);
        assertFiltered(result);
        assert.ok(text(result).includes('Safe needle value'), 'safe files stay searchable');
        assert.ok(!text(result).includes('ignored needle'), 'native ignore semantics are retained');
        if (input.path === '..') assert.ok(text(result).includes('parent needle'), 'allowed parent-directory text stays searchable');
    }
    assert.ok(opened.length > 0, 'the test actually reads safe files');
    assert.ok(!opened.some(name => name.startsWith(agentDir + path.sep) || ['auth.json', '.env', 'hard.json', 'alias.json'].includes(path.basename(name))),
        'protected data files must be excluded before opening a content descriptor');
});

test('managed grep keeps regex, literal, case, glob, context, line numbers and match limits on verified buffers', async () => {
    const result = await run({ path: '.', glob: '*.json', pattern: 'needle', ignoreCase: true, context: 1, limit: 1 });
    assertFiltered(result);
    const output = text(result);
    assert.ok(output.includes(':2: Safe needle value') || output.includes(':1: safe NEEDLE second'), 'matches carry file line numbers');
    if (output.includes(':2: Safe needle value')) assert.ok(output.includes('-1- before') && output.includes('-3- after'), 'context comes from the verified snapshot');
    assert.equal(result.details.matchLimitReached, 1);
    const literal = await run({ path: 'safe[1].txt', pattern: '[x]', literal: true });
    assertFiltered(literal); assert.ok(text(literal).includes('safe[1].txt:1: literal [x] needle'));
    const regex = await run({ path: 'safe.json', pattern: '^Safe.*value$' });
    assertFiltered(regex); assert.ok(text(regex).includes('safe.json:2: Safe needle value'));
    for (const name of ['one.anchor', 'two.anchor']) fs.writeFileSync(path.join(cwd, name), 'needle');
    const anchored = await run({ path: '.', glob: '*.anchor', pattern: '\\Aneedle\\z' });
    assertFiltered(anchored);
    assert.ok(text(anchored).includes('one.anchor:1: needle') && text(anchored).includes('two.anchor:1: needle'), 'each original file keeps its own regex boundaries');
    const alias = await run({ path: 'safe-link.json', pattern: 'needle' });
    assertFiltered(alias); assert.ok(text(alias).includes('Safe needle value'), 'a safe direct file alias remains supported');
    for (const name of ['auth.json', '.env', 'hard.json', 'dangling.json', 'loop-a'])
        await assert.rejects(run({ path: name, pattern: '.' }), /Managed Bot grep/);
    const stateResult = await run({ path: 'private-dir', pattern: 'SYNTHETIC_PRIVATE' });
    assert.ok(text(stateResult).includes('private.json:1:'), 'direct state search works when allowed by the tool gate');
});

test('managed grep uses kernel descriptor identity and rejects a substituted descriptor before reading it', async t => {
    const open = io.openRead;
    t.mock.method(io, 'openRead', filename => open(filename === path.join(cwd, 'safe.json') ? path.join(agentDir, 'private.json') : filename));
    const result = await run({ path: 'safe.json', pattern: '.' });
    assertFiltered(result);
    assert.equal(result.details.pivaneBotGrep.partial, true);
    assert.ok(!text(result).includes('Safe needle value'), 'the wrong descriptor never supplies a result');
});

test('managed grep withholds a file whose contents change while its descriptor is being read', async t => {
    const filename = path.join(cwd, 'changing.txt'); fs.writeFileSync(filename, 'original safe needle\n');
    t.after(() => fs.rmSync(filename, { force: true }));
    const open = io.openRead;
    t.mock.method(io, 'openRead', async requested => {
        const handle = await open(requested);
        if (requested === filename) {
            const read = handle.read.bind(handle); let changed = false;
            handle.read = async (...args) => {
                const result = await read(...args);
                if (!changed && result.bytesRead) { changed = true; fs.writeFileSync(filename, protectedMarker); }
                return result;
            };
        }
        return handle;
    });
    const result = await run({ path: 'changing.txt', pattern: '.' });
    assertFiltered(result);
    assert.equal(result.details.pivaneBotGrep.partial, true);
    assert.ok(!text(result).includes('original safe needle'), 'a changed file contributes no contents');
});

test('managed grep reports bounded omissions, rejects unsupported arguments and cleans up aborted execution', async () => {
    const bounded = path.join(cwd, 'bounded'); fs.mkdirSync(bounded);
    fs.writeFileSync(path.join(bounded, 'too-large.txt'), Buffer.alloc(GREP_LIMITS.fileBytes + 1, 120));
    fs.writeFileSync(path.join(bounded, 'binary.txt'), Buffer.from([110, 0, 120]));
    fs.writeFileSync(path.join(bounded, 'bad-utf8.txt'), Buffer.from([255, 254]));
    fs.writeFileSync(path.join(bounded, 'safe.txt'), 'bounded needle\n');
    const result = await run({ path: 'bounded', pattern: 'needle' });
    assertFiltered(result);
    assert.equal(result.details.pivaneBotGrep.partial, true);
    assert.ok(text(result).includes('Incomplete search') && text(result).includes('bounded needle'));
    for (const input of [{ pattern: '[' }, { pattern: '.', context: 21 }, { pattern: '.', limit: 1001 }, { pattern: 'a\nb' }])
        await assert.rejects(run(input), /Managed Bot grep/);
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(run({ path: '.', pattern: '.' }, aborted.signal), /Managed Bot grep/);
    assertFiltered(await run({ path: 'safe.json', pattern: 'needle' }));
});

test('managed grep charges failed reads against its total byte allowance', async t => {
    const directory = path.join(cwd, 'failed-budget'); fs.mkdirSync(directory);
    const count = GREP_LIMITS.totalBytes / GREP_LIMITS.fileBytes;
    for (let index = 0; index <= count; index++) fs.writeFileSync(path.join(directory, `${index}.txt`), Buffer.alloc(GREP_LIMITS.fileBytes, 120));
    const opened = [], open = io.openRead;
    t.mock.method(io, 'openRead', async filename => {
        const handle = await open(filename);
        if (filename.startsWith(directory + path.sep)) {
            opened.push(filename);
            const read = handle.read.bind(handle);
            handle.read = async (...args) => { await read(...args); throw new Error('Synthetic read failure'); };
        }
        return handle;
    });
    const result = await run({ path: 'failed-budget', pattern: '.' });
    assertFiltered(result);
    assert.equal(result.details.pivaneBotGrep.partial, true);
    assert.equal(opened.length, count, 'failed files must not get a free read outside the total allowance');
});

test('verified Bot SDK registration overrides native grep; ordinary Pi sessions keep native grep', { timeout: 30000 }, async t => {
    const sdk = await import('@earendil-works/pi-coding-agent');
    const { PiSessionStore } = require('../server/pi-session-store');
    const { PiProfileRegistry } = require('../server/pi-profile-registry');
    const { BotService } = require('../server/bot/bot-service');
    const store = new PiSessionStore(), profiles = new PiProfileRegistry(store); store.profiles = profiles;
    t.after(() => profiles.dispose());
    const bots = new BotService({ store, profiles, supervisor: { on() {}, off() {} } });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const { session: native } = await bots.resolve(created.bot.id, created.window.id), manager = sdk.SessionManager.open(native.path);
    const context = await bots.windowContext(manager, { cwd: native.cwd, sessionId: native.id, sessionPath: native.path });
    fs.writeFileSync(path.join(native.cwd, 'auth.json'), protectedMarker);
    fs.writeFileSync(path.join(native.cwd, 'safe.json'), 'registered safe needle\n');
    for (const [key, value] of Object.entries({ PIVANE_BOT_CONTEXT: JSON.stringify(context), PI_WEB_NAVIGATION_TOKEN: 'synthetic-navigation' })) {
        const prior = process.env[key]; process.env[key] = value;
        t.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
    }
    const file = path.join(__dirname, '../server/bot/bot-context-extension.ts');
    const { registerBotContext } = await require(process.env.PIVANE_TEST_PI_JITI).createJiti(file).import(file);
    const runtime = await sdk.ModelRuntime.create({ authPath: path.join(agentDir, 'auth.json'), modelsPath: null,
        modelsStorePath: path.join(agentDir, 'catalog.json'), allowModelNetwork: false, refreshOnCreate: false });
    const broken = path.join(root, 'unverified-agent');
    fs.mkdirSync(path.join(broken, 'pivane-profiles', 'profiles.json'), { recursive: true });
    for (const kind of ['bot', 'ordinary', 'unverified']) {
        const verified = kind === 'bot';
        const current = kind === 'ordinary' ? sdk.SessionManager.inMemory(native.cwd) : manager;
        const settings = sdk.SettingsManager.inMemory({ enableInstallTelemetry: false, compaction: { enabled: false }, retry: { enabled: false } });
        const loader = new sdk.DefaultResourceLoader({ cwd: native.cwd, agentDir, settingsManager: settings, noExtensions: true, noSkills: true,
            noPromptTemplates: true, noContextFiles: true, noThemes: true,
            extensionFactories: [pi => registerBotContext(pi, () => kind === 'unverified' ? broken : agentDir)] });
        await loader.reload();
        const request = kind === 'ordinary' ? { path: 'safe.json', pattern: '.' } : { path: '.', glob: '*.json', pattern: '.' };
        const probe = { name: 'grep_probe', label: 'Grep probe', description: 'Synthetic nested grep caller',
            parameters: { type: 'object', properties: {} },
            execute: async (_id, _input, _signal, _update, ctx) => {
                const outcome = await ctx.executeTool('grep', request);
                return { ...outcome.result, isError: outcome.isError };
            } };
        const { session } = await sdk.createAgentSession({ cwd: native.cwd, agentDir, settingsManager: settings, modelRuntime: runtime,
            model: { provider: 'fixture', id: 'model', api: 'openai-completions', name: 'Synthetic', input: ['text'], contextWindow: 32000, maxTokens: 1000 },
            sessionManager: current, resourceLoader: loader, tools: ['grep', 'grep_probe'], customTools: [probe] });
        await session.bindExtensions({ mode: 'rpc' });
        try {
            const definition = session.getToolDefinition('grep');
            assert.equal(definition.description.includes('descriptor-verified'), verified);
            // ctx.executeTool follows the real validation and tool_call hooks. Calling
            // a raw AgentTool.execute directly deliberately bypasses those hooks.
            session.agent.state.messages.push({ role: 'assistant', content: [{ type: 'toolCall', id: 'probe', name: 'grep_probe', arguments: {} }],
                provider: 'fixture', api: 'openai-completions', model: 'model', stopReason: 'toolUse', timestamp: Date.now() });
            const tool = session.agent.state.tools.find(item => item.name === 'grep_probe');
            const result = await tool.execute('probe', {});
            assertFiltered(result);
            if (kind === 'unverified') {
                assert.equal(result.isError, true);
                assert.ok(text(result).includes('Managed Bot grep is unavailable'), 'failed startup verification cannot fall through to native grep');
                continue;
            }
            assert.ok(text(result).includes('registered safe needle'));
            assert.equal(Boolean(result.details?.pivaneBotGrep), verified);
            if (verified) {
                const stale = { cwd: native.cwd, sessionManager: sdk.SessionManager.inMemory(native.cwd) };
                await assert.rejects(definition.execute('stale', { path: '.', pattern: '.' }, undefined, undefined, stale), /unavailable/);
            }
        } finally { session.dispose(); }
    }
});
