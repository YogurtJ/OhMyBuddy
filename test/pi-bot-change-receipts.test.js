const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { captureBotChanges, compareBotChanges, changeDetails, registerBotChangeReceipts, shouldWatchTool,
    MAX_PENDING, MAX_SNAPSHOT_BYTES } = require('../server/bot/bot-change-receipts');
const { defaultBot } = require('../server/bot/bot-settings');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-changes-')));
const agentDir = path.join(root, 'agent'); fs.mkdirSync(agentDir);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_PROJECT_ROOTS = root; process.env.OHMYBUDDY_WORKSPACES_DIR = path.join(root, 'workspaces');
process.env.PI_OFFLINE = '1';
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const id = '11111111-2222-3333-4444-555555555555';
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function fixture() {
    const agent = fs.mkdtempSync(path.join(root, 'fixture-'));
    const data = path.join(agent, 'pivane-profiles', 'data', id);
    fs.mkdirSync(data, { recursive: true });
    const profile = { id, name: 'Buddy', description: '', soul: 'Be kind', enabled: true,
        memory: { enabled: true, autoLearn: false }, skills: { learnedEnabled: true }, bot: defaultBot({ workspace: root }) };
    const registry = path.join(agent, 'pivane-profiles', 'profiles.json');
    const save = () => write(registry, JSON.stringify({ version: 1, profiles: [profile], defaults: {} }));
    save();
    return { agent, data, profile, registry, save, capture: previous => captureBotChanges(agent, id, previous) };
}
const changesAfter = (f, before) => compareBotChanges(before, f.capture(before));
function hooks() {
    const handlers = new Map();
    return { pi: { on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
        registerTool() {}, getAllTools: () => [] },
    async emit(name, event, ctx) {
        let result;
        for (const handler of handlers.get(name) || []) {
            const patch = await handler(event, ctx);
            if (patch) { result = { ...result, ...patch }; event = { ...event, ...patch }; }
            if (patch?.block) break;
        }
        return result;
    } };
}

test('memory entry sets ignore trailing metadata and report replacements as removed plus added entries', () => {
    const f = fixture(), project = path.join(f.data, 'projects', 'a'.repeat(64));
    write(path.join(f.data, 'USER.md'), 'Keep\n<!-- created=2026-01-01, last=2026-01-02 -->\n§\nOld');
    write(path.join(f.data, 'MEMORY.md'), 'Previous');
    write(path.join(f.data, 'failures.md'), 'Past failure');
    write(path.join(project, 'MEMORY.md'), 'Project old');
    const before = f.capture(); assert.ok(before);
    write(path.join(f.data, 'USER.md'), 'Keep\n<!-- created=2026-01-01, last=2026-10-29, project64=L3RtcA -->\n§\nNew\n§\nNew\n§\nAnother');
    write(path.join(f.data, 'MEMORY.md'), 'Current');
    fs.rmSync(path.join(f.data, 'failures.md'));
    write(path.join(project, 'MEMORY.md'), 'Project old\n§\nProject new');
    write(path.join(f.data, 'ignored.md'), 'Never reported');
    const changes = changesAfter(f, before);
    assert.deepEqual(changes, [
        { area: 'user', action: 'added', count: 2, previews: ['New', 'Another'] },
        { area: 'user', action: 'removed', count: 1 },
        { area: 'memory', action: 'added', count: 2, previews: ['Current', 'Project new'] },
        { area: 'memory', action: 'removed', count: 2 }
    ]);
    const metadata = f.capture();
    write(path.join(f.data, 'USER.md'), 'Keep\n<!-- created=2026-01-01, last=2026-10-30 -->\n§\nNew\n§\nAnother');
    assert.deepEqual(changesAfter(f, metadata), []);
});

test('previews stop at three entries and 160 Unicode characters; skills use frontmatter or directory names', () => {
    const f = fixture(), before = f.capture();
    write(path.join(f.data, 'USER.md'), ['😀'.repeat(200), 'Second', 'Third', 'Fourth'].join('\n§\n'));
    for (let n = 0; n < 12; n++) write(path.join(f.data, 'skills', `skill-${String(n).padStart(2, '0')}`, 'SKILL.md'),
        n ? '# No frontmatter' : '---\nname: "Named skill"\n---\nDo something');
    const changes = changesAfter(f, before);
    assert.deepEqual(changes.find(change => change.area === 'user'), { area: 'user', action: 'added', count: 4,
        previews: ['😀'.repeat(160), 'Second', 'Third'] });
    const skill = changes.find(change => change.area === 'skill');
    assert.equal(skill.action, 'added'); assert.equal(skill.count, 12); assert.equal(skill.names.length, 10);
    assert.deepEqual(skill.names.slice(0, 2), ['Named skill', 'skill-01']);
});

test('skill add/remove/update includes project skills and ignores unchanged file contents', () => {
    const f = fixture(), skill = name => path.join(f.data, 'skills', name, 'SKILL.md');
    write(skill('remove'), '---\nname: Remove me\n---\nOld');
    write(skill('update'), '---\nname: Old name\n---\nOld');
    write(skill('same'), 'Same');
    const before = f.capture();
    fs.rmSync(path.dirname(skill('remove')), { recursive: true });
    write(skill('update'), '---\nname: New name\n---\nNew content');
    write(skill('same'), 'Same');
    write(path.join(f.data, 'projects', 'b'.repeat(64), 'skills', 'project-skill', 'SKILL.md'), '# New');
    const changes = changesAfter(f, before);
    assert.deepEqual(changes, [
        { area: 'skill', action: 'removed', count: 1, names: ['Remove me'] },
        { area: 'skill', action: 'updated', count: 1, names: ['New name'] },
        { area: 'skill', action: 'added', count: 1, names: ['project-skill'] }
    ]);
});

test('settings report only the eight contract field names, without settings values or unrelated fields', () => {
    const f = fixture(), before = f.capture();
    f.profile.description = 'unrelated'; f.profile.bot.order = 10;
    f.profile.bot.permissions.rules = [{ private: 'never included' }]; f.save();
    assert.deepEqual(changesAfter(f, before), []);
    Object.assign(f.profile, { name: 'Secret name', avatar: { kind: 'emoji', value: '🙂' }, soul: 'Secret personality' });
    Object.assign(f.profile.bot, { job: 'Secret job', model: { provider: 'private-provider', id: 'private-model', thinking: 'low' }, thinking: 'high',
        notify: { ...f.profile.bot.notify, proactive: false } });
    f.profile.bot.permissions.preset = 'ask'; f.save();
    const changes = changesAfter(f, before);
    assert.deepEqual(changes, [{ area: 'settings', action: 'updated', names: ['name', 'avatar', 'personality', 'job', 'workStyle', 'model', 'thinking', 'notify'] }]);
    assert.doesNotMatch(JSON.stringify(changes), /Secret|private|🙂|high|ask/);
    const after = f.capture(); delete f.profile.bot.thinking; f.save();
    assert.deepEqual(changesAfter(f, after), [{ area: 'settings', action: 'updated', names: ['thinking'] }]);
});

test('unchanged fingerprints reuse decoded files; ctime detects an equal-size edit with restored mtime', async () => {
    const f = fixture(), file = path.join(f.data, 'USER.md'); write(file, 'Before');
    const before = f.capture(), same = f.capture(before);
    assert.equal(same.files.get(file), before.files.get(file)); assert.equal(same.settings, before.settings);
    const stat = fs.statSync(file);
    // This filesystem can coalesce timestamps within a tick; isolate the ctime change.
    await new Promise(resolve => setTimeout(resolve, 10));
    write(file, 'After!'); fs.utimesSync(file, stat.atime, stat.mtime);
    assert.deepEqual(changesAfter(f, before), [{ area: 'user', action: 'added', count: 1, previews: ['After!'] },
        { area: 'user', action: 'removed', count: 1 }]);
});

test('invalid UTF-8, oversized files, symlinks, corrupt registry and exceeded scan/buffer budgets report nothing', () => {
    const f = fixture(), file = path.join(f.data, 'USER.md'); write(file, 'Known');
    const before = f.capture();
    for (const bad of [Buffer.from([0xff]), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
        write(file, bad); assert.equal(f.capture(before), null); assert.deepEqual(changesAfter(f, before), []);
    }
    fs.rmSync(file); fs.symlinkSync(f.registry, file);
    assert.equal(f.capture(before), null); fs.rmSync(file); write(file, 'Known');
    write(f.registry, '{broken'); assert.equal(f.capture(before), null); f.save();
    const old = path.join(f.data, 'skills', 'old'); write(path.join(old, 'SKILL.md'), 'Known skill');
    const skillBefore = f.capture(); fs.rmSync(old, { recursive: true }); fs.symlinkSync(root, old, 'dir');
    assert.equal(f.capture(skillBefore), null); fs.rmSync(old);
    const skills = path.join(f.data, 'skills');
    for (let n = 0; n < 5001; n++) write(path.join(skills, `entry-${n}`), '');
    assert.equal(f.capture(before), null); fs.rmSync(skills, { recursive: true });
    for (let n = 0; n < 5; n++) write(path.join(skills, `large-${n}`, 'SKILL.md'), 'x'.repeat(Math.floor(MAX_SNAPSHOT_BYTES / 5) + 1));
    assert.equal(f.capture(before), null);
    assert.equal(captureBotChanges(f.agent, '../invalid'), null);
});

test('receipt merging preserves details shapes and collisions and watches only top-level mutating tools', () => {
    const changes = [{ area: 'user', action: 'added', count: 1, previews: ['Known'] }];
    for (const details of [[], 'text', 0, false, new Date(), Object.create({ inherited: true }), { pivaneBotChanges: { original: true } }])
        assert.equal(changeDetails(details, changes), undefined);
    const details = Object.assign(Object.create(null), { original: { nested: true }, pivaneToolProvenance: { source: 'fixture' } });
    assert.deepEqual(changeDetails(details, changes), { details: { ...details, pivaneBotChanges: { v: 1, changes } } });
    assert.deepEqual(changeDetails(undefined, changes), { details: { pivaneBotChanges: { v: 1, changes } } });
    assert.equal(changeDetails({}, []), undefined);
    for (const toolName of ['memory_add', 'memory_replace', 'memory_remove', 'skill_manage', 'bot_setup_propose', 'bot_schedule', 'window_note',
        'bot_topic_propose', 'deliver_files', 'read', 'grep', 'find', 'ls', 'window_recall', 'window_read', 'web_search', 'fetch_content',
        'get_search_content', 'memory_search', 'session_search']) assert.equal(shouldWatchTool({ toolName }), false, toolName);
    for (const toolName of ['bash', 'write', 'edit', 'codemode', 'powershell', 'unknown_extension']) {
        assert.equal(shouldWatchTool({ toolName }), true); assert.equal(shouldWatchTool({ toolName, parentToolCallId: 'parent' }), false);
    }
});

test('pending snapshots are bounded, consumed once and cleared on execution/run/session end', async () => {
    const f = fixture(), h = hooks(), target = { agentDir: f.agent, profileId: id };
    registerBotChangeReceipts(h.pi, () => target);
    const call = n => ({ toolName: 'write', toolCallId: `call-${n}` });
    for (let n = 0; n <= MAX_PENDING; n++) await h.emit('tool_call', call(n));
    write(path.join(f.data, 'USER.md'), 'New');
    assert.equal(await h.emit('tool_result', call(0)), undefined, 'oldest snapshot is evicted');
    assert.ok((await h.emit('tool_result', call(1))).details.pivaneBotChanges);
    assert.equal(await h.emit('tool_result', call(1)), undefined, 'snapshot is consumed once');
    for (const event of ['tool_execution_end', 'agent_end', 'session_shutdown', 'session_start']) {
        await h.emit('tool_call', call(event)); await h.emit(event, call(event));
        write(path.join(f.data, 'USER.md'), event);
        assert.equal(await h.emit('tool_result', call(event)), undefined, event);
    }
    const broken = hooks(); registerBotChangeReceipts(broken.pi, () => { throw new Error('Private error'); });
    assert.equal(await broken.emit('tool_call', call('broken')), undefined);
    assert.equal(await broken.emit('tool_result', call('broken')), undefined);
});

test('verified Bot worker attaches changes to the causing top-level result and preserves provenance/content/errors', async t => {
    const { PiSessionStore } = require('../server/pi-session-store');
    const { PiProfileRegistry } = require('../server/pi-profile-registry');
    const { BotService } = require('../server/bot/bot-service');
    const { registerToolProvenance } = require('../server/pi-tool-provenance');
    const { SessionManager } = await import('@earendil-works/pi-coding-agent');
    const store = new PiSessionStore(), profiles = new PiProfileRegistry(store); store.profiles = profiles;
    t.after(() => profiles.dispose());
    const bots = new BotService({ store, profiles, supervisor: { on() {}, off() {} } });
    const created = await bots.create({ expectedRevision: (await profiles.state()).revision });
    const { session } = await bots.resolve(created.bot.id, created.window.id), manager = SessionManager.open(session.path);
    const context = await bots.windowContext(manager, { cwd: session.cwd, sessionId: session.id, sessionPath: session.path });
    for (const [key, value] of Object.entries({ PIVANE_BOT_CONTEXT: JSON.stringify(context), PI_WEB_NAVIGATION_TOKEN: 'synthetic-navigation' })) {
        const prior = process.env[key]; process.env[key] = value;
        t.after(() => { if (prior === undefined) delete process.env[key]; else process.env[key] = prior; });
    }
    const extension = path.join(__dirname, '../server/bot/bot-context-extension.ts');
    const { registerBotContext } = require(process.env.PIVANE_TEST_PI_JITI).createJiti(extension)(extension);
    const h = hooks();
    h.pi.getAllTools = () => [{ name: 'custom_writer', sourceInfo: { source: 'fixture', path: '/synthetic/extension.js' } }];
    registerBotContext(h.pi, () => agentDir); registerToolProvenance(h.pi);
    const ctx = { mode: 'rpc', cwd: session.cwd, sessionManager: manager, hasUI: true,
        ui: { async confirm() { return true; }, notify() {} } };
    const data = path.join(agentDir, 'ohmybuddy-profiles', 'data', created.bot.id), user = path.join(data, 'USER.md');
    const call = { toolName: 'custom_writer', toolCallId: 'causing-tool', input: {} };
    assert.equal(await h.emit('tool_call', call, ctx), undefined);
    write(user, 'Likes tea'); write(path.join(data, 'skills', 'tea', 'SKILL.md'), '---\nname: Tea brewing\n---\nBrew tea');
    await bots.update(created.bot.id, { expectedRevision: (await profiles.state()).revision, changes: { soul: 'A calm personality' } });
    const content = [{ type: 'text', text: 'Tool output' }], details = { original: { keep: true } };
    const patch = await h.emit('tool_result', { ...call, details, content, isError: true }, ctx);
    assert.deepEqual(patch.details.pivaneBotChanges, { v: 1, changes: [
        { area: 'user', action: 'added', count: 1, previews: ['Likes tea'] },
        { area: 'skill', action: 'added', count: 1, names: ['Tea brewing'] },
        { area: 'settings', action: 'updated', names: ['personality'] }
    ] });
    assert.equal(patch.details.original, details.original); assert.equal(patch.details.pivaneToolProvenance.toolCallId, call.toolCallId);
    assert.equal(patch.content, undefined); assert.equal(patch.isError, undefined);
    assert.deepEqual(details, { original: { keep: true } }); assert.deepEqual(content, [{ type: 'text', text: 'Tool output' }]);
    let n = 0;
    for (const skip of [{ toolName: 'bash', parentToolCallId: 'parent' }, { toolName: 'memory_add' }, { toolName: 'bot_setup_propose' }, { toolName: 'read' }]) {
        const event = { ...skip, toolCallId: `skip-${n++}`, input: {} };
        await h.emit('tool_call', event, ctx); write(user, `Skip ${n}`);
        assert.equal((await h.emit('tool_result', { ...event, details: {} }, ctx))?.details?.pivaneBotChanges, undefined);
    }
    const parent = { toolName: 'codemode', toolCallId: 'parent' }, child = { toolName: 'write', toolCallId: 'child', parentToolCallId: 'parent' };
    await h.emit('tool_call', parent, ctx); await h.emit('tool_call', child, ctx); write(user, 'Parent-covered');
    assert.equal(await h.emit('tool_result', child, ctx), undefined);
    assert.ok((await h.emit('tool_result', parent, ctx)).details.pivaneBotChanges);
    for (const shape of [[], 'primitive', new Date(), { pivaneBotChanges: { existing: true } }]) {
        const event = { toolName: 'write', toolCallId: `shape-${n++}` };
        await h.emit('tool_call', event, ctx); write(user, `Shape ${n}`);
        assert.equal(await h.emit('tool_result', { ...event, details: shape }, ctx), undefined);
    }
    const foreign = { ...ctx, sessionManager: { getSessionId: () => 'foreign' } };
    for (const wrongContext of [{ ...ctx, mode: 'interactive' }, foreign]) {
        const event = { toolName: 'write', toolCallId: `unverified-${n++}` };
        await h.emit('tool_call', event, wrongContext); write(user, `Unverified ${n}`);
        assert.equal(await h.emit('tool_result', event, wrongContext), undefined);
    }
});
