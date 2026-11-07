// The plain-word lists Bot settings shows for each way of working (public/pi-bot-settings.js)
// must say what the Bot's tool gate (server/bot/bot-guard.js) actually does. Every listed item has
// representative tool calls here; "direct" items must run, "asks" items must ask and "refused"
// items must be refused. An item without probes fails, so the list and the gate change together.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { approvalFor } = require('../server/bot/bot-guard');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-work-styles-')));
const cwd = path.join(root, 'workspace'), agentDir = path.join(root, 'agent'), outside = path.join(root, 'outside');
for (const dir of [cwd, agentDir, outside]) fs.mkdirSync(dir);
fs.writeFileSync(path.join(cwd, 'notes.txt'), 'synthetic note');
fs.writeFileSync(path.join(cwd, '.env'), 'synthetic credential');
fs.writeFileSync(path.join(outside, 'other.txt'), 'synthetic outside file');
fs.writeFileSync(path.join(agentDir, 'private.txt'), 'synthetic private state');
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    fs.rmSync(root, { recursive: true, force: true });
});

const sandbox = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/pi-bot-settings.js'), 'utf8'), sandbox);
const STYLES = sandbox.PiBotWorkStyles.list;

const bash = command => ({ toolName: 'bash', input: { command } });
const read = file => ({ toolName: 'read', input: { path: file } });
const write = file => ({ toolName: 'write', input: { path: file, content: 'x' } });
const edit = file => ({ toolName: 'edit', input: { path: file, edits: [{ oldText: 'synthetic', newText: 'x' }] } });
const schedule = action => ({ toolName: 'bot_schedule', input: action === 'cancel' ? { action, id: 'job-1' } : { action, title: '交房租', once: '2026-11-01T09:00' } });
// Representative calls for every item key; one key may mean slightly different calls per way of working.
const PROBES = {
    files: [read(path.join(outside, 'other.txt')), write(path.join(outside, 'new.txt')), edit(path.join(cwd, 'notes.txt'))],
    commands: [bash('node script.js'), bash('ls -la'), bash('npm test')],
    install: [bash('npm install lodash'), bash('pip install requests')],
    web: [{ toolName: 'web_search', input: { query: 'pivane' } }, { toolName: 'fetch_content', input: { url: 'https://example.invalid' } }],
    'memory-schedule': [{ toolName: 'memory_add', input: { content: '喜欢简短' } }, schedule('create'), schedule('cancel')],
    delegate: [{ toolName: 'subagent', input: { task: 'review' } }, { toolName: 'agent_thread', input: { message: 'help' } }],
    state: [read(path.join(agentDir, 'private.txt')), write(path.join(agentDir, 'note.txt'))],
    elevate: [bash('sudo ls'), bash('doas reboot')],
    delete: [bash('rm -rf build'), bash('find . -name x -delete')],
    power: [bash('shutdown now'), bash('kill 123'), bash('systemctl restart nginx')],
    git: [bash('git push origin main'), bash('git reset --hard')],
    publish: [bash('npm publish'), bash('gh release create v1')],
    mail: [bash('sendmail someone@example.invalid'), bash('mail -s hi someone@example.invalid')],
    autostart: [bash('crontab -e'), write(path.join(root, 'home/.config/autostart/x.desktop'))],
    credentials: [read(path.join(cwd, '.env')), write(path.join(cwd, '.env'))],
    runtime: [bash('cat x > .pivane-runtime/state.json'), write(path.join(root, 'srv/.pivane-runtime/state.json'))],
    read: [read(path.join(cwd, 'notes.txt')), read(path.join(outside, 'other.txt'))],
    memory: [{ toolName: 'memory_add', input: { content: '喜欢简短' } }],
    workspace: [write(path.join(cwd, 'new.txt')), edit(path.join(cwd, 'notes.txt'))],
    media: [{ toolName: 'media_generate', input: { modelId: 'image', parameters: {} } }],
    outside: [write(path.join(outside, 'new.txt')), edit(path.join(outside, 'other.txt'))],
    schedule: [schedule('create'), schedule('cancel')],
    write: [write(path.join(cwd, 'new.txt')), edit(path.join(cwd, 'notes.txt'))],
    other: [{ toolName: 'media_generate', input: { modelId: 'image', parameters: {} } }, { toolName: 'some_new_tool', input: {} }],
    topic: [{ toolName: 'bot_topic_propose', input: { title: '学习计划' } }]
};

// bot_topic_propose asks inside its own execute handler in every preset (see bot-topic-tool.ts).
const decide = (preset, probe) => probe.toolName === 'bot_topic_propose' ? { kind: 'topic' } : approvalFor({ permissions: { preset, rules: [] }, cwd, agentDir, ...probe });
const describe = probe => `${probe.toolName} ${JSON.stringify(probe.input)}`;

test('the three ways of working are listed from most freedom to most careful', () => {
    // Arrays from the vm context belong to another realm; compare plain copies.
    assert.deepEqual(Array.from(STYLES, style => style.id), ['free', 'balanced', 'ask']);
    assert.deepEqual(Array.from(STYLES, style => style.level), [3, 2, 1]);
    for (const style of STYLES) {
        assert.ok(style.name() && style.line(), `${style.id} has a name and a one-line summary`);
        const keys = [...style.direct, ...style.asks, ...style.refused].map(item => item.key);
        assert.equal(new Set(keys).size, keys.length, `${style.id}: each item is listed once`);
        for (const item of [...style.direct, ...style.asks, ...style.refused]) assert.ok(item.label(), `${style.id}/${item.key} has a label`);
    }
});

test('every listed item matches the tool gate', () => {
    for (const style of STYLES) {
        for (const [group, expected] of [['direct', 'runs'], ['asks', 'asks'], ['refused', 'refused']]) {
            for (const item of style[group]) {
                const probes = PROBES[item.key];
                assert.ok(probes?.length, `${style.id}/${item.key} needs probes in this test`);
                for (const probe of probes) {
                    const decision = decide(style.id, probe);
                    const actual = decision === null ? 'runs' : decision.block ? 'refused' : decision.kind ? 'asks' : 'unknown';
                    assert.equal(actual, expected, `${style.id} "${item.label()}": ${describe(probe)}`);
                }
            }
        }
    }
});
