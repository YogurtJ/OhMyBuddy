const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { approvalFor, ruleFor, normalizeRule, parseRule, approvalMessage, parseApprovalMessage, classifyCommand, BLOCKED, newToken } = require('../server/bot/bot-guard');

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-bot-guard-policy-')));
const cwd = path.join(root, 'workspace'), agentDir = path.join(root, 'agent'), outside = path.join(root, 'outside');
for (const dir of [cwd, agentDir, outside]) fs.mkdirSync(dir);
fs.writeFileSync(path.join(cwd, 'notes.txt'), 'synthetic note');
fs.writeFileSync(path.join(agentDir, 'private.txt'), 'synthetic private state');
fs.writeFileSync(path.join(cwd, '.env'), 'synthetic credential');
fs.symlinkSync(agentDir, path.join(cwd, 'private-alias'));
fs.symlinkSync(path.join(agentDir, 'private.txt'), path.join(cwd, 'innocent.txt'));
fs.linkSync(path.join(agentDir, 'private.txt'), path.join(cwd, 'hard.txt'));
fs.symlinkSync(outside, path.join(cwd, 'escape'));
fs.symlinkSync(outside, path.join(cwd, '@where'));
fs.symlinkSync(agentDir, path.join(cwd, '@private'));
fs.symlinkSync(agentDir, path.join(cwd, "pri'vate"));
fs.symlinkSync(agentDir, path.join(cwd, 'private\u00a0alias'));
fs.symlinkSync(path.join(root, 'missing'), path.join(cwd, 'dangling'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const check = (preset, toolName, input, rules = [], annotations) => approvalFor({ permissions: { preset, rules }, cwd, agentDir, toolName, input, annotations });
const classify = (command, toolName = 'bash') => classifyCommand({ toolName, input: { command }, cwd, agentDir }).status;

test('free permits understood routine commands and asks before danger or opaque shell syntax', () => {
    for (const command of ['pwd', 'date', 'ls -la', 'cat "notes.txt"', "cat 'notes.txt'", 'cat no\\ tes.txt', 'echo "hello; world"', 'printf "%s" "hi"',
        'git status --short', 'git diff --no-ext-diff --no-textconv', 'mkdir -p notes/new', 'touch notes/new.txt']) {
        assert.equal(classify(command), 'safe', command);
        assert.equal(check('free', 'bash', { command }), null, command);
        assert.ok(check('balanced', 'bash', { command }).rule, command);
    }
    const risky = ['rm -rf notes', 'sudo ls', 'systemctl restart example', 'kill 123', 'chmod 777 notes', 'git push origin main', 'git reset --hard',
        'curl https://example.invalid', 'gh release create v1', 'npm publish', 'docker restart example', 'cp notes.txt ../outside/note.txt',
        `touch ${outside}/new.txt`, "touch '@where/new.txt'", 'sed -i s/a/b/ notes.txt'];
    const opaque = ['echo ok; date', 'ls | head', 'echo ok && pwd', 'echo ok\npwd', 'echo hi > ../outside/note.txt',
        'cat <(echo hi)', 'cat $(echo notes.txt)', 'cat `echo notes.txt`', 'cat *.txt', 'cat "$FILE"',
        "python -c 'print(1)'", 'node -e "console.log(1)"', "bash -c 'date'", "eval 'date'", 'command date',
        'timeout 2 date', 'X=1 date', 'LS', 'ls.exe', './script.sh', '/tmp/ls', 'cat "unterminated', 'git diff', 'git -c core.pager=x status', 'git status --help', 'git log --no-ext-diff --no-textconv --help',
        'git log --no-ext-diff --no-textconv --output=notes.txt', 'find . -exec echo {} \\;'];
    for (const command of [...risky, ...opaque]) {
        const decision = check('free', 'bash', { command });
        assert.equal(decision.kind, 'command', command);
        assert.equal(decision.rule, undefined, command);
        assert.notEqual(classify(command), 'safe', command);
    }
    assert.equal(classify('Get-Date', 'powershell'), 'safe');
    assert.equal(check('free', 'powershell', { command: 'Get-Content "notes.txt"' }), null);
    for (const command of ['Remove-Item -Recurse notes', 'Restart-Service Example', 'Invoke-WebRequest https://example.invalid',
        'Get-Date; Get-Location', '& "script.ps1"', 'powershell -EncodedCommand AAAA', 'Get-Content $file', 'Get-Content @files', 'Get-Content notes.txt,other.txt', '/usr/bin/get-date', 'Get-Content Function:foo']) {
        assert.equal(check('free', 'powershell', { command }).kind, 'command', command);
        assert.equal(check('balanced', 'powershell', { command }).rule, undefined, command);
    }
});

test('all presets refuse obvious credentials, private state and aliases before an approval', () => {
    const targets = ['.env', '.env.local', '.env*', '/proc/self/environ', '/etc/shadow', '.ssh/id_ed25519', '.aws/credentials', '.config/gcloud/token.json', '.docker/config.json',
        'auth.json', '.netrc', 'key.pem', 'private.key', 'pivane-profiles/profiles.json', 'private-alias/new.txt', 'innocent.txt', 'hard.txt', 'dangling',
        path.join(agentDir, 'new/deep/state.json'), pathToFileURL(path.join(agentDir, 'private.txt')).href];
    for (const preset of ['free', 'balanced', 'ask', 'unknown', undefined]) {
        for (const target of targets) {
            for (const toolName of ['read', 'write', 'edit', 'grep', 'find', 'ls', 'custom_reader']) {
                const decision = check(preset, toolName, { path: target }, [{ v: 9, allow: '*' }], { readOnlyHint: true });
                assert.deepEqual(decision, { block: true, reason: BLOCKED.protected }, `${preset} ${toolName} ${target}`);
                assert.ok(!decision.reason.includes(target), 'refusal does not echo a private path');
            }
        }
        for (const command of ['cat .env', 'cat .env*', 'cat /etc/shadow', 'cat ".e"\'nv\'', 'cat .e\\nv', 'cat .e\\\nnv', 'echo ok; cat auth.json',
            'cat "$HOME/.ssh/id_rsa"', 'cat ${HOME}/.env', 'cat private-alias/private.txt', "cat '@private/private.txt'", "cat 'private\u00a0alias/private.txt'", 'cat innocent.txt', 'cat hard.txt',
            'cat < .env', 'cat $(echo .env)', "python -c 'open(\".env\").read()'", "python -c 'open(\"innocent.txt\").read()'", "eval 'cat .env'", 'printenv', 'env', 'echo "$API_TOKEN"',
            'cat /proc/self/environ', 'git show --no-ext-diff --no-textconv HEAD:.env', `cat '${agentDir}/private.txt'`,
            `cat ${pathToFileURL(path.join(agentDir, 'private.txt')).href}`])
            assert.equal(check(preset, 'bash', { command }).block, true, `${preset} ${command}`);
        for (const command of ['Get-Content .env', 'Get-Content private-alias/private.txt', 'Get-ChildItem Env:', 'Write-Output $env:API_TOKEN', 'Get-Content Variable:API_TOKEN', 'Get-Content private-alias\\private.txt', "Get-Content 'pri''vate/private.txt'"])
            assert.equal(check(preset, 'powershell', { command }).block, true, command);
    }
});

test('file grants are canonical, exact and bound to tool and working directory', () => {
    const input = { path: 'escape/new.txt', content: 'synthetic' };
    const approval = check('free', 'write', input), rule = approval.rule;
    assert.equal(approval.kind, 'outside');
    assert.equal(rule.value, path.join(outside, 'new.txt'));
    assert.deepEqual(normalizeRule(rule), rule);
    assert.equal(check('ask', 'write', input, [rule]), null);
    assert.equal(check('ask', 'write', { path: '../outside/new.txt' }, [rule]), null);
    assert.equal(check('ask', 'edit', input, [rule]).kind, 'outside');
    assert.equal(check('ask', 'write', { path: '../outside/other.txt' }, [rule]).kind, 'outside');
    assert.equal(approvalFor({ permissions: { preset: 'ask', rules: [rule] }, toolName: 'write', input: { path: rule.value }, cwd: outside, agentDir }).kind, 'write');
    assert.equal(check('ask', 'write', input, []).kind, 'outside', 'revocation takes effect');
    const ordinary = ruleFor({ toolName: 'write', input: { path: 'notes.txt' }, cwd, agentDir });
    fs.unlinkSync(path.join(cwd, 'notes.txt')); fs.symlinkSync(path.join(agentDir, 'private.txt'), path.join(cwd, 'notes.txt'));
    assert.equal(check('ask', 'write', { path: 'notes.txt' }, [ordinary]).block, true, 'retargeted paths cannot reuse a grant');
    fs.unlinkSync(path.join(cwd, 'notes.txt')); fs.writeFileSync(path.join(cwd, 'notes.txt'), 'synthetic note');
    for (const target of ['/etc/example.conf', '.git/config', '.bashrc', '.config/systemd/test.service']) {
        const decision = check('free', 'write', { path: target });
        assert.ok(decision);
        assert.equal(decision.rule, undefined, target);
    }
});

test('command grants never override risk, unknown classification, private paths or destructive metadata', () => {
    const rule = check('balanced', 'bash', { command: 'ls -la' }).rule;
    assert.equal(check('ask', 'bash', { command: 'ls -la' }, [rule]), null);
    assert.equal(check('ask', 'bash', { command: 'ls  -la' }, [rule]).kind, 'command', 'command bytes must match');
    assert.equal(check('ask', 'powershell', { command: 'ls -la' }, [rule]).kind, 'command');
    assert.equal(check('ask', 'bash', { command: 'ls -la' }, [rule], { destructiveHint: true }).kind, 'command');
    for (const command of ['rm -rf notes', 'sudo pwd', "bash -c 'pwd'", 'pwd; date', 'cat .env', 'cat private-alias/private.txt']) {
        const forged = { ...rule, value: command };
        const decision = check('ask', 'bash', { command }, [forged]);
        assert.ok(decision, command); assert.equal(decision.rule, undefined, command);
        assert.throws(() => normalizeRule(forged), /Invalid/);
    }
    assert.equal(check('ask', 'bash', { command: 'pwd' }, [{ v: 2, id: 'future', allow: '*' }]).kind, 'command');
    assert.equal(check('unknown', 'bash', { command: 'date' }).kind, 'command');
    assert.equal(check('unknown', 'bash', { command: 'ls -la' }, [rule]).kind, 'command');
    assert.equal(check('ask', 'grep', { path: '.', glob: '.env*', pattern: 'anything' }).block, true);
    assert.equal(check('free', 'subagent', { task: 'routine' }), null);
    for (const preset of ['balanced', 'ask']) assert.equal(check(preset, 'subagent', { task: 'routine' }).kind, 'delegate');
    for (const tool of ['bot_setup_propose', 'bot_topic_propose', 'codemode', 'ask_user_question', 'read_document'])
        assert.equal(check('ask', tool, {}), null, tool);
    assert.equal(check('balanced', 'memory_add', { content: 'remember' }), null);
    assert.equal(check('ask', 'window_note', { text: 'remember' }).kind, 'action');
});

test('NB-02 PowerShell quoted wildcard file selectors are refused and cannot become grants', () => {
    for (const command of ["Get-Content 'auth.*'", "Get-Content '*'", 'Get-Content "auth?json"',
        "Get-Content 'auth[.]json'", "Get-Content '[a]uth.json'", "Get-Content -Path '*.json'", "Get-Content 'safe.*'",
        "Get-ChildItem '*'", "Get-Item '?'", "Get-Content -LiteralPath '*' -Force", 'Get-Content -LiteralPath safe[1].txt']) {
        for (const preset of ['free', 'balanced', 'ask']) {
            const input = { command }, forged = { v: 1, id: 'old-ps-rule', tool: 'powershell', value: command, cwd };
            const decision = check(preset, 'powershell', input, [forged]);
            assert.deepEqual(decision, { block: true, reason: BLOCKED.protected }, command);
            assert.equal(ruleFor({ toolName: 'powershell', input, cwd, agentDir }), null);
            assert.throws(() => normalizeRule(forged), /Invalid/);
        }
    }
    fs.writeFileSync(path.join(cwd, 'safe[1].txt'), 'synthetic literal');
    for (const command of ["Get-Content 'notes.txt'", "Get-Content -LiteralPath 'safe[1].txt'", 'Write-Output "*"']) {
        assert.equal(check('free', 'powershell', { command }), null, command);
        assert.ok(check('balanced', 'powershell', { command }).rule, command);
    }
});

test('rule parsing rejects broad shapes and approval envelopes keep both formats', () => {
    const rule = ruleFor({ toolName: 'bash', input: { command: 'pwd' }, cwd, agentDir });
    const token = newToken(), detail = 'a\n\nb';
    const message = approvalMessage({ kind: 'command', token, detail, rule });
    assert.equal(message, `command #${token}\nrule ${JSON.stringify(rule)}\n\na\n\nb`);
    assert.deepEqual(parseApprovalMessage(message), { kind: 'command', token, detail, rule });
    assert.deepEqual(parseApprovalMessage(approvalMessage({ kind: 'topic', token, detail })), { kind: 'topic', token, detail });
    for (const bad of [{ ...rule, v: 2 }, { ...rule, id: '' }, { ...rule, tool: 'read' }, { ...rule, cwd: '.' }, { ...rule, glob: '*' },
        { ...rule, tool: 'write', value: path.join(cwd, '*.txt') }, { ...rule, value: 'pwd\ndate' }]) {
        assert.equal(parseRule(bad), null); assert.throws(() => normalizeRule(bad), /Invalid/);
    }
    for (const header of ['{', '{}', JSON.stringify({ ...rule, allow: true })]) assert.equal(parseApprovalMessage(`command #${token}\nrule ${header}\n\nx`), null);
    for (const target of [cwd, path.join(cwd, '.env'), '/etc/example.conf', path.join(cwd, 'hard.txt')])
        assert.throws(() => normalizeRule({ ...rule, tool: 'write', value: target }), /Invalid/);
});
