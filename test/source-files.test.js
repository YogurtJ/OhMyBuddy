const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sourceFiles, distributionFiles, verifyBundledMemory } = require('../scripts/source-files.cjs');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pivane-source-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}
function put(root, name) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '// synthetic source\n');
}

test('source discovery includes nested modules and tests without following user data or old copies', t => {
    const root = fixture(t);
    for (const file of ['server/session/runtime.js', 'server/session/bridge.ts', 'server/old.js.bak',
        'public/chat/transport.js', 'public/chat/view.css', 'public/images/private.js', 'public/vendor/library.js',
        'public/bot-avatars/bean.svg', 'public/bot-avatars/untrusted.svg', 'public/other.svg',
        'public/images/bot-avatar-minimal-20261026/pivane-minimal-bots.html',
        'public/legacy-workspace/chat.js', 'public/.private/record.js', 'server/pivane-queue/intentions.js',
        'public/pivane-session-moves/record.js', 'server/pivane-uploads/original.js',
        'public/OhMyBuddy/Tasks/task/result.js', 'server/OhMyBuddy/Tasks/task/result.js', 'public/OhMyBuddy Workspaces/tasks/private.js',
        'test/OhMyBuddy/Tasks/task/private.test.js',
        'server/browser-output/site.js', 'public/browser-output/site.html', 'test/browser-output/site.test.js',
        'test/session/runtime.test.js', 'test/browser/page.cjs', 'test/helpers/fixture.cjs']) put(root, file);
    assert.deepEqual(sourceFiles(root, 'server'), ['server/session/bridge.ts', 'server/session/runtime.js']);
    assert.deepEqual(sourceFiles(root, 'public'), ['public/bot-avatars/bean.svg', 'public/chat/transport.js', 'public/chat/view.css']);
    assert.deepEqual(sourceFiles(root, 'tests'), ['test/session/runtime.test.js']);
    assert.deepEqual(sourceFiles(root, 'browser'), ['test/browser/page.cjs']);
    assert.ok(sourceFiles(root, 'testSupport').includes('test/helpers/fixture.cjs'));
    assert.throws(() => sourceFiles(root, 'unknown'), /Unknown/);
});

test('source discovery refuses linked code directories instead of silently omitting their tests or packaging targets', t => {
    const root = fixture(t), outside = fixture(t);
    put(root, 'server/main.js'); put(outside, 'secret.js');
    fs.symlinkSync(outside, path.join(root, 'server/linked'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => sourceFiles(root, 'server'), /symlink/);
});

test('release inventory requires the reviewed memory build even when installation scripts are skipped by an older updater', t => {
    const root = fixture(t);
    assert.throws(() => verifyBundledMemory(root), /run node scripts\/install.cjs/);
    put(root, 'server/profile-memory/upstream-bundle.mjs');
    assert.throws(() => verifyBundledMemory(root), /differs from the reviewed build/);
    fs.copyFileSync(path.resolve(__dirname, '../server/profile-memory/upstream-bundle.mjs'), path.join(root, 'server/profile-memory/upstream-bundle.mjs'));
    assert.doesNotThrow(() => verifyBundledMemory(root));
});

test('release inventory includes its own discovery and checking tools and excludes maintenance and user data', () => {
    const files = distributionFiles(path.resolve(__dirname, '..'));
    for (const file of ['scripts/source-files.cjs', 'scripts/check-syntax.cjs', 'scripts/run-tests.cjs',
        'server/pi-update-installer.js', 'server/browser/launch.js', 'test/source-files.test.js', 'pi-packages/media-workbench/skills/media-workbench/SKILL.md',
        'scripts/build-mermaid.cjs', 'scripts/mermaid-build/package.json', 'scripts/mermaid-build/package-lock.json',
        'public/vendor/mermaid-11.17.2-dompurify-3.4.17.min.js',
        'public/pi-avatar-presets.js', 'public/bot-avatars/pebble.svg', 'public/bot-avatars/bean.svg', 'public/bot-avatars/tile.svg']) assert.ok(files.includes(file), file);
    assert.equal(new Set(files).size, files.length);
    assert.equal(files.some(file => /^(?:backups|docs\/local|\.pivane-runtime|node_modules)\//.test(file)), false);
    assert.equal(files.some(file => /^public\/(?:images|audio|videos|downloads|legacy-workspace)\//.test(file)), false);
    assert.equal(files.includes('AGENTS.local.md'), false);
    assert.equal(files.includes('native/pi-win32-fd.lib'), false);
});


test('built-in SVG sources contain only the catalog geometry, solid colors and two fixed eyes', () => {
    const { presets, validId } = require('../public/pi-avatar-presets');
    assert.deepEqual(presets.slice(0, 3).map(preset => preset.id), ['pivane-pebble', 'pivane-bean', 'pivane-tile']);
    assert.equal(presets.length, 12);
    assert.equal(new Set(presets.map(preset => preset.asset)).size, presets.length);
    for (const preset of presets) {
        assert.equal(validId(preset.id), true);
        assert.match(preset.name, /^[\p{L}]+$/u);
        assert.match(preset.path, /^[MmLlHhVvCcSsQqTtAaZz0-9 .,\-]+$/);
        for (const color of [preset.body, preset.eyes, preset.darkBody, preset.darkEyes]) assert.match(color, /^#[a-f0-9]{6}$/);
        const svg = fs.readFileSync(path.resolve(__dirname, '../public', preset.asset), 'utf8');
        if (preset.id.startsWith('pivane-')) assert.equal(svg.trim(), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="OhMyBuddy ${preset.name}"><title>OhMyBuddy ${preset.name} · 极简原型</title><path fill="${preset.body}" d="${preset.path}"/><g fill="${preset.eyes}"><rect x="61" y="63" width="8" height="19" rx="4"/><rect x="91" y="63" width="8" height="19" rx="4"/></g></svg>`, preset.asset);
        else {
            assert.ok(svg.includes(`d="${preset.path}"`));
            assert.doesNotMatch(svg, /<script|<foreignObject|<image|\son[a-z]+=|href=|url\(/i);
            assert.match(svg, /viewBox="0 0 160 160"/);
        }
    }
});

test('server public access allows exactly the catalog SVGs without opening prototype or arbitrary SVG paths', t => {
    const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
    const ast = require('acorn').parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
    const declaration = ast.body.flatMap(node => node.type === 'VariableDeclaration' ? node.declarations : [])
        .find(node => node.id.name === 'workspaceAccess');
    const optionsNode = declaration.init.arguments[0];
    // Evaluate only the actual access options, without starting any application services.
    const options = require('node:vm').runInNewContext(`(${source.slice(optionsNode.start, optionsNode.end)})`, {
        fs, path, __dirname: path.resolve(__dirname, '..'), require: require('node:module').createRequire(path.resolve(__dirname, '../server.js'))
    });
    const { WorkspaceAccessService } = require('../server/workspace-access-service');
    const access = new WorkspaceAccessService({ ...options, filePath: path.join(fixture(t), 'access.json'), envToken: () => 'synthetic-avatar-access' });
    t.after(() => access.dispose());
    const call = (pathname, method = 'GET') => {
        let allowed = false;
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {} };
        access.middleware()({ path: pathname, method, headers: {}, protocol: 'http', get() { return 'localhost'; } }, res, () => { allowed = true; });
        return allowed ? 200 : res.statusCode;
    };
    for (const { asset } of require('../public/pi-avatar-presets').presets) {
        assert.equal(call('/' + asset), 200);
        assert.equal(call('/' + asset, 'HEAD'), 200);
        assert.equal(call('/' + asset, 'POST'), 401);
    }
    for (const pathname of ['/bot-avatars/untrusted.svg', '/bot-avatars/bean.svg/extra', '/bot-avatars/../images/bean.svg',
        '/images/bot-avatar-minimal-20261026/bean.svg', '/images/bot-avatar-minimal-20261026/pivane-minimal-bots.html']) assert.equal(call(pathname), 401, pathname);
});
