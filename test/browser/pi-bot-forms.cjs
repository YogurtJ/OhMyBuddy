// Bot mode forms keep what the user decided. Setup cards keep edits after a failed save and do
// not bring back a face or name the user already chose (UAT-03/09); a picture can be the face
// (UAT-01). The notebook editor keeps a draft after a failed save and shows and edits exact due
// times (UAT-10/12). Every way out of the settings sheet warns about unsaved edits (UAT-11). The
// selection menu has no side-chat entry on the Bot page (UAT-05). Real page modules and styles,
// synthetic callbacks; desktop and phone widths.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BOT = '11111111-1111-4111-8111-111111111111', MAIN = '22222222-2222-4222-8222-222222222222';
const PUBLIC = path.join(__dirname, '../../public');
const styles = [...fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8').matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match => match[1]);
// A small opaque PNG, built here so its checksums are right.
const PNG = (() => {
    const zlib = require('node:zlib');
    const crc = bytes => { let c = -1; for (const byte of bytes) { c ^= byte; for (let i = 0; i < 8; i++) c = c >>> 1 ^ (c & 1 ? 0xedb88320 : 0); } return (c ^ -1) >>> 0; };
    const chunk = (type, data) => { const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
        const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0); return Buffer.concat([head, data, tail]); };
    const header = Buffer.alloc(13); header.writeUInt32BE(4, 0); header.writeUInt32BE(4, 4); header[8] = 8; header[9] = 2;
    const rows = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, ...Array(4).fill([240, 160, 60]).flat()])));
    return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
})();
const SELECT = { method: 'select', title: '保存这些设置？ / Save these settings?', options: ['保存 / Save', '先不改 / Not now'] };

(async () => {
    const app = express();
    app.get('/__forms', (_req, res) => res.type('html').send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        ${styles.map(href => `<link rel="stylesheet" href="/${href}">`).join('\n')}</head><body class="pi-page"><main id="forms" style="max-width: 760px; margin: 24px auto; padding: 0 12px;"></main></body></html>`));
    app.use(express.static(PUBLIC));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const evidence = process.env.PI_BOT_EVIDENCE;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393]) {
            const context = await browser.newContext({ viewport: { width, height: 860 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', isMobile: width < 900, hasTouch: width < 900 });
            const page = await context.newPage(), errors = [];
            page.setDefaultTimeout(8000);
            page.on('pageerror', error => errors.push(error.message));
            await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
            const load = async (...scripts) => {
                await page.goto(`${base}/__forms`);
                for (const script of ['pi-avatar-presets.js', 'pi-avatar.js', 'pi-bot-motion.js', ...scripts]) await page.addScriptTag({ url: `${base}/${script}` });
            };
            // fail: how many saves fail with a plain conflict, or the error codes of the failing saves in turn.
            const mount = (args, identity, fail = 0) => page.evaluate(({ args, identity, fail, select }) => {
                document.querySelector('.pi-bot-setup')?.remove();
                window.t = { saves: [], uploads: [], responses: [], notes: [], fail: Array.isArray(fail) ? fail : Array(fail).fill(null), identity };
                const cards = PiBot.setupCards({ enabled: () => true, calls: () => [{ id: 'call-1', args }], respond: value => t.responses.push(value),
                    face: () => Object.assign(document.createElement('span'), { className: 'pi-bot-face is-sm', textContent: '🦉' }), changed: () => {},
                    identity: () => t.identity, notify: message => t.notes.push(message),
                    // Each upload is a new picture version, as the avatar service reports it, and becomes the face.
                    uploadPicture: async dataUrl => {
                        t.uploads.push(dataUrl.slice(0, 22));
                        const avatar = { kind: 'image', version: String(t.uploads.length).repeat(64) };
                        t.identity = { ...t.identity, avatar };
                        return { ok: true, profile: { avatar } };
                    },
                    save: async (id, changes, options) => {
                        t.saves.push({ id, changes, options, uploadsBefore: t.uploads.length });
                        if (t.fail.length) { const code = t.fail.shift(); throw Object.assign(new Error('synthetic conflict'), { status: 409, ...(code ? { code } : {}) }); }
                    } });
                document.querySelector('#forms').append(cards.element);
                cards.sync(new Map([['ui-1', { id: 'ui-1', ...select }]]), true);
            }, { args, identity, fail, select: SELECT });
            const values = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-setup-field]')].map(input => [input.dataset.setupField, input.value])));
            const shot = async name => { if (evidence) { await page.waitForTimeout(150); await page.screenshot({ path: path.join(evidence, `${name}-${width}.png`) }); } };

            // 1. A failed save keeps every edit and unticked fact; the retry sends the user's values (UAT-09).
            await load('pi-bot.js');
            const fresh = { id: BOT, name: '新伙伴', avatar: { kind: 'preset', id: 'pivane-pebble' }, job: '', chosen: { name: false, avatar: false }, steps: {} };
            await mount({ name: '提议名字', avatar: { kind: 'preset', id: 'pivane-pebble' }, job: '默认职责', personality: '默认性格', aboutUser: ['条目一', '条目二'] }, fresh, 1);
            await page.locator('[data-setup-field="name"]').fill('用户选定名字');
            await page.locator('[data-avatar-preset="pivane-bean"]').click();
            await page.locator('[data-setup-field="job"]').fill('只帮我整理计划');
            await page.locator('[data-setup-fact]').last().uncheck();
            await page.locator('.pi-bot-setup-save').click();
            await page.locator('.pi-bot-setup-note.is-error').filter({ hasText: '你的修改还在' }).waitFor();
            assert.deepEqual(await values(), { name: '用户选定名字', job: '只帮我整理计划', personality: '默认性格' });
            assert.equal(await page.locator('[data-avatar-preset="pivane-bean"]').getAttribute('aria-pressed'), 'true');
            assert.deepEqual(await page.locator('[data-setup-fact]').evaluateAll(boxes => boxes.map(box => box.checked)), [true, false]);
            await page.locator('.pi-bot-setup-save').click();
            await page.waitForFunction(() => t.responses.length === 1);
            const saves = await page.evaluate(() => t.saves.map(item => item.changes));
            const chosen = { name: '用户选定名字', avatar: { kind: 'preset', id: 'pivane-bean' }, job: '只帮我整理计划', personality: '默认性格', aboutUser: ['条目一'] };
            assert.deepEqual(saves, [chosen, chosen], 'the retry sends what the user chose');
            assert.deepEqual(await page.evaluate(() => t.responses), [{ id: 'ui-1', value: '保存 / Save' }]);

            // 2. A later card does not bring back a chosen face; what is already set is left out (UAT-03).
            // Chosen as the server reports it (here: in Bot settings, before the interview's identity step).
            const chosenFace = { id: BOT, name: '小狸', avatar: { kind: 'preset', id: 'pivane-bean' }, job: '帮我整理', chosen: { name: true, avatar: true }, steps: {} };
            await mount({ name: '小狸', avatar: { kind: 'preset', id: 'pivane-pebble' }, job: '只帮我整理计划', finish: true }, chosenFace);
            assert.equal(await page.locator('[data-setup-field="name"]').count(), 0, 'the unchanged name is not shown');
            assert.equal(await page.locator('.pi-bot-setup-field.is-avatar').evaluate(row => row.classList.contains('is-kept')), true);
            assert.equal(await page.locator('.pi-bot-setup-current .pi-preset-svg[data-preset="pivane-bean"]').count(), 1);
            assert.equal(await page.locator('[data-setup-use="avatar"]').isChecked(), false);
            await shot('bot-setup-followup');
            await page.locator('.pi-bot-setup-save').click();
            await page.waitForFunction(() => t.responses.length === 1);
            assert.deepEqual(await page.evaluate(() => t.saves[0].changes), { avatar: null, job: '只帮我整理计划', finish: true });
            // Picking a new preset, or ticking the change, is the user asking for it.
            await mount({ avatar: { kind: 'preset', id: 'pivane-pebble' }, job: '只帮我整理计划' }, chosenFace);
            await page.locator('[data-avatar-preset="pivane-tile"]').click();
            assert.equal(await page.locator('[data-setup-use="avatar"]').isChecked(), true);
            await page.locator('.pi-bot-setup-save').click();
            await page.waitForFunction(() => t.saves.length === 1);
            assert.deepEqual(await page.evaluate(() => t.saves[0].changes.avatar), { kind: 'preset', id: 'pivane-tile' });
            // A card with nothing new still records the confirmed steps on the server.
            await mount({ name: '小狸', job: '帮我整理' }, chosenFace);
            assert.equal(await page.locator('.pi-bot-setup-head strong').textContent(), '这些已经是现在的设置了');
            assert.equal(await page.locator('.pi-bot-setup-later').isVisible(), false);
            await page.locator('.pi-bot-setup-save').click();
            assert.deepEqual(await page.evaluate(() => [t.saves.length, t.saves[0].changes, t.responses]), [1, {}, [{ id: 'ui-1', value: '保存 / Save' }]]);

            // 3. A picture face is uploaded before the card is saved, and the save names that exact picture (UAT-01).
            // A plain conflict keeps the upload; the face changed elsewhere means uploading it again.
            await mount({ avatar: '👋', job: '整理计划' }, fresh, [null, 'BOT_PICTURE_CHANGED']);
            await page.locator('[data-setup-picture-file]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
            await page.locator('.pi-bot-setup-picture img').waitFor();
            assert.match(await page.locator('.pi-bot-setup-note').textContent(), /图片会在保存时上传/);
            await shot('bot-setup-picture');
            await page.locator('.pi-bot-setup-save').click();
            await page.locator('.pi-bot-setup-note.is-error').filter({ hasText: '设置刚刚有变化' }).waitFor();
            await page.locator('.pi-bot-setup-save').click();
            await page.locator('.pi-bot-setup-note.is-error').filter({ hasText: '头像刚刚在别处被换掉了' }).waitFor();
            await page.locator('.pi-bot-setup-save').click();
            await page.waitForFunction(() => t.responses.length === 1);
            const pictured = await page.evaluate(() => t);
            const one = '1'.repeat(64), two = '2'.repeat(64);
            assert.equal(pictured.uploads.length, 2, 'not uploaded again after a plain conflict, but again after the face changed elsewhere');
            assert.deepEqual(pictured.saves.map(item => [item.changes, item.options, item.uploadsBefore]),
                [[{ avatar: null, job: '整理计划' }, { picture: one, workStyleShown: false }, 1], [{ avatar: null, job: '整理计划' }, { picture: one, workStyleShown: false }, 1],
                    [{ avatar: null, job: '整理计划' }, { picture: two, workStyleShown: false }, 2]]);
            assert.deepEqual(pictured.notes, []);
            // Not saving after the picture went up: the user is told the picture is already the face.
            await mount({ avatar: '👋', job: '整理计划' }, fresh, 1);
            await page.locator('[data-setup-picture-file]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
            await page.locator('.pi-bot-setup-picture img').waitFor();
            await page.locator('.pi-bot-setup-save').click();
            await page.locator('.pi-bot-setup-note.is-error').waitFor();
            await page.locator('.pi-bot-setup-later').click();
            assert.deepEqual(await page.evaluate(() => [t.notes, t.responses]), [['上传的图片已经是头像了；要换回可以在设置里改。'], [{ id: 'ui-1', value: '先不改 / Not now' }]]);
            // Still said after switching the draft back to an emoji; not said once the face was changed elsewhere.
            for (const [elsewhere, notes] of [[false, 1], [true, 0]]) {
                await mount({ avatar: '👋', job: '整理计划' }, fresh, 1);
                await page.locator('[data-setup-picture-file]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
                await page.locator('.pi-bot-setup-picture img').waitFor();
                await page.locator('.pi-bot-setup-save').click();
                await page.locator('.pi-bot-setup-note.is-error').waitFor();
                await page.locator('[data-setup-picture="clear"]').click();
                if (elsewhere) await page.evaluate(() => { t.identity = { ...t.identity, avatar: { kind: 'emoji', value: '🐯' } }; });
                await page.locator('.pi-bot-setup-later').click();
                assert.equal(await page.evaluate(() => t.notes.length), notes, `face changed elsewhere: ${elsewhere}`);
            }
            // With the real Bot page object: the upload's answer counts even when re-reading the Bot list fails.
            await page.evaluate(({ bot }) => {
                document.querySelector('.pi-bot-setup')?.remove();
                window.u = { notes: [], responses: [], saves: 0 };
                const ui = PiBot.create({ api: async (url, options) => {
                    if (url.endsWith('/avatar') && options?.method === 'POST')
                        return { ok: true, revision: 'r-after-upload', profile: { id: bot.id, avatar: { kind: 'image', version: '9'.repeat(64) } } };
                    throw new Error('Failed to fetch');
                }, toast: () => {}, open: () => {}, say: () => {}, pane: document.createElement('div'), header: document.createElement('div'),
                    input: document.createElement('textarea'), onChange: () => {} });
                Object.assign(ui, { bots: [structuredClone(bot)], revision: 'r-before', profileId: bot.id, active: true });
                window.u.ui = ui;
                const cards = PiBot.setupCards({ enabled: () => true, calls: () => [{ id: 'call-1', args: { avatar: '👋' } }], respond: value => u.responses.push(value),
                    face: () => document.createElement('span'), changed: () => {}, identity: () => ui.setupIdentity(), uploadPicture: dataUrl => ui.uploadAvatar(dataUrl),
                    notify: message => u.notes.push(message),
                    save: async () => { u.saves++; throw Object.assign(new Error('changed'), { status: 409 }); } });
                document.querySelector('#forms').append(cards.element);
                u.cards = cards;
                cards.sync(new Map([['ui-1', { id: 'ui-1', method: 'select', title: '保存这些设置？ / Save these settings?', options: ['保存 / Save', '先不改 / Not now'] }]]), true);
            }, { bot: { id: BOT, name: '新伙伴', avatar: { kind: 'emoji', value: '✨' }, chosen: { name: false, avatar: false }, bot: { job: '', onboarding: { steps: {} } } } });
            await page.locator('[data-setup-picture-file]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
            await page.locator('.pi-bot-setup-picture img').waitFor();
            await page.locator('.pi-bot-setup-save').click();
            await page.locator('.pi-bot-setup-note.is-error').waitFor();
            assert.deepEqual(await page.evaluate(() => [u.ui.revision, u.ui.setupIdentity().avatar.kind, u.saves]), ['r-after-upload', 'image', 1]);
            await page.locator('.pi-bot-setup-later').click();
            assert.deepEqual(await page.evaluate(() => u.notes), ['上传的图片已经是头像了；要换回可以在设置里改。']);
            // The next card proposing an emoji keeps that picture by default, as it would after a good list read.
            await page.evaluate(() => u.cards.sync(new Map([['ui-2', { id: 'ui-2', method: 'select', title: '保存这些设置？ / Save these settings?', options: ['保存 / Save', '先不改 / Not now'] }]]), true));
            await page.locator('.pi-bot-setup-field.is-avatar.is-kept').waitFor();
            assert.equal(await page.locator('[data-setup-use="avatar"]').isChecked(), false);
            // Back to a built-in preset: no upload.
            await mount({ avatar: { kind: 'preset', id: 'pivane-pebble' } }, fresh);
            await page.locator('[data-setup-picture-file]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
            await page.locator('[data-setup-picture="clear"]').click();
            await page.locator('.pi-bot-setup-save').click();
            await page.waitForFunction(() => t.responses.length === 1);
            assert.deepEqual(await page.evaluate(() => [t.uploads.length, t.saves[0].changes, t.saves[0].options]), [0, { avatar: { kind: 'preset', id: 'pivane-pebble' } }, { picture: null, workStyleShown: false }]);

            // 3b. The way of working (same rule as workStyleOffered on the server). The card says whether it
            // showed the choice (workStyleShown) when saved or left for later.
            const work = (workStyle, steps = {}) => ({ ...chosenFace, workStyle, steps, phase: 'interview' });
            const choices = () => page.locator('[data-setup-work]').evaluateAll(nodes => nodes.map(node => [node.value, node.checked]));
            // Unchanged and carried along with other fields: not shown, not saved.
            await mount({ job: '只帮我整理计划', personality: '慢慢说', workStyle: 'free' }, work('free'));
            assert.deepEqual(await choices(), []);
            await page.locator('.pi-bot-setup-save').click();
            await page.waitForFunction(() => t.saves.length === 1);
            assert.deepEqual(await page.evaluate(() => [t.saves[0].changes, t.saves[0].options.workStyleShown]), [{ job: '只帮我整理计划', personality: '慢慢说' }, false]);
            // Its own card while the step is open: the three choices, once; a pick is saved.
            await mount({ workStyle: 'free', finish: true }, work('free'));
            assert.deepEqual(await choices(), [['free', true], ['balanced', false], ['ask', false]]);
            await page.locator('[data-setup-work="balanced"]').check();
            await page.locator('.pi-bot-setup-save').click();
            await page.waitForFunction(() => t.saves.length === 1);
            assert.deepEqual(await page.evaluate(() => [t.saves[0].changes, t.saves[0].options.workStyleShown]), [{ workStyle: 'balanced', finish: true }, true]);
            // Blank optional fields propose nothing: still its own card, also when left for later.
            await mount({ name: '', job: ' ', personality: '', aboutUser: ['', ' '], finish: false, workStyle: 'free' }, work('free'));
            assert.deepEqual(await choices(), [['free', true], ['balanced', false], ['ask', false]]);
            await page.evaluate(() => { t.later = []; });
            await page.evaluate(() => {
                document.querySelector('.pi-bot-setup')?.remove();
                const cards = PiBot.setupCards({ enabled: () => true, calls: () => [{ id: 'call-1', args: { name: '', aboutUser: [''], workStyle: 'free' } }],
                    respond: value => t.responses.push(value), face: () => document.createElement('span'), changed: () => {}, identity: () => t.identity,
                    save: async () => {}, later: async (id, options) => { t.later.push([id, options]); } });
                document.querySelector('#forms').append(cards.element);
                cards.sync(new Map([['ui-1', { id: 'ui-1', method: 'select', title: '保存这些设置？ / Save these settings?', options: ['保存 / Save', '先不改 / Not now'] }]]), true);
            });
            assert.equal(await page.locator('[data-setup-work]').count(), 3);
            await page.locator('.pi-bot-setup-later').click();
            assert.deepEqual(await page.evaluate(() => [t.later, t.responses]), [[['call-1', { workStyleShown: true }]], [{ id: 'ui-1', value: '先不改 / Not now' }]]);
            // Answered already and asked again unchanged: not shown; nothing to choose.
            await mount({ workStyle: 'free' }, work('free', { work: 'done' }));
            assert.deepEqual(await choices(), []);
            assert.equal(await page.locator('.pi-bot-setup-head strong').textContent(), '这些已经是现在的设置了');
            await page.locator('.pi-bot-setup-save').click();
            await page.waitForFunction(() => t.saves.length === 1);
            assert.deepEqual(await page.evaluate(() => [t.saves[0].changes, t.saves[0].options.workStyleShown]), [{}, false]);
            await mount({ workStyle: 'balanced' }, work('balanced', { work: 'skipped' }));
            assert.deepEqual(await choices(), [], 'a skipped step counts as answered');
            // A different way among other fields is a real change: shown and saved. A freer one starts at the
            // current way, and only that or more careful ones are offered.
            await mount({ job: '只帮我整理计划', workStyle: 'balanced' }, work('free', { work: 'done' }));
            assert.deepEqual(await choices(), [['free', false], ['balanced', true], ['ask', false]]);
            await page.locator('.pi-bot-setup-save').click();
            await page.waitForFunction(() => t.saves.length === 1);
            assert.deepEqual(await page.evaluate(() => [t.saves[0].changes, t.saves[0].options.workStyleShown]), [{ job: '只帮我整理计划', workStyle: 'balanced' }, true]);
            await mount({ name: '新名字', workStyle: 'free' }, work('ask', { work: 'done' }));
            assert.deepEqual(await choices(), [['ask', true]]);
            assert.match(await page.locator('.pi-bot-setup-work-note').textContent(), /在设置里改/);

            // 3c. "Mainly helps with" wraps and grows; it is saved as one line. Personality keeps its paragraphs.
            await mount({ job: '整理计划', personality: '第一段。\n\n第二段。' }, fresh);
            const box = page.locator('[data-setup-field="job"]');
            assert.equal(await box.evaluate(node => node.tagName), 'TEXTAREA');
            const grown = async () => box.evaluate(node => node.clientHeight);
            const short = await grown();
            await box.fill('先整理本周计划，\n再把下周要做的事列出来；\r\n遇到冲突先问我。'.repeat(4));
            assert.ok(await grown() > short, 'the box grows with what is typed');
            assert.ok(await box.evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'long text wraps');
            await box.fill('先整理本周计划，\n\n 再把下周要做的事列出来；\t遇到冲突先问我。');
            await page.locator('[data-setup-field="personality"]').fill('第一段。\n\n第二段。\n第三段。');
            await page.locator('.pi-bot-setup-save').click();
            await page.waitForFunction(() => t.saves.length === 1);
            assert.deepEqual(await page.evaluate(() => t.saves[0].changes), { job: '先整理本周计划， 再把下周要做的事列出来； 遇到冲突先问我。', personality: '第一段。\n\n第二段。\n第三段。' });

            // 4. Every way out of the settings sheet warns once about unsaved edits, valid or not (UAT-11).
            const settings = { revision: 'r1', bot: { id: BOT, name: '小狸', avatar: { kind: 'emoji', value: '🦉' }, soul: '回答简短。',
                bot: { job: '帮助整理计划', model: null, permissions: { preset: 'free' } } }, models: { defaults: null, models: [] } };
            const openSettings = () => page.evaluate(async data => {
                window.s = { memory: 0, restart: 0, writes: 0 };
                await PiBotSettings.open({ profileId: data.bot.id, api: async (_url, options) => { if (options) s.writes++; return structuredClone(data); },
                    face: () => document.createElement('span'), toast: () => {}, onMemory: () => { s.memory++; }, onRestart: async () => { s.restart++; } });
            }, settings);
            const open = () => page.locator('.pi-bot-sheet[open]').count();
            await load('pi-bot-settings.js');
            await openSettings();
            await page.locator('.pi-bot-sheet[open] input[required]').fill('');
            await page.locator('.pi-bot-sheet[open] .pi-bot-sheet-close').click();
            assert.equal(await open(), 1, 'an emptied name is an unsaved edit too');
            assert.match(await page.locator('.pi-bot-sheet[open] .pi-bot-sheet-status').textContent(), /还有修改没保存/);
            await page.keyboard.press('Escape');
            assert.equal(await open(), 0, 'the second try leaves');
            await openSettings();
            await page.locator('.pi-bot-sheet[open] .pi-bot-sheet-body textarea').nth(1).fill('这是一段未保存的新性格。');
            await page.locator('.pi-bot-sheet[open]').getByRole('button', { name: '记忆和关于你' }).click();
            assert.deepEqual([await open(), await page.evaluate(() => s.memory)], [1, 0]);
            assert.match(await page.locator('.pi-bot-sheet[open] .pi-bot-sheet-status').textContent(), /再点一次就放弃这些修改并离开/);
            await shot('bot-settings-leave');
            await page.locator('.pi-bot-sheet[open]').getByRole('button', { name: '记忆和关于你' }).click();
            assert.deepEqual([await open(), await page.evaluate(() => s.memory)], [0, 1]);
            await openSettings();
            await page.locator('.pi-bot-sheet[open] .pi-bot-sheet-body textarea').nth(0).fill('陪我练英语');
            const restart = page.locator('.pi-bot-sheet[open] .pi-bot-sheet-link').filter({ hasText: '重新互相认识' });
            await restart.click(); await page.locator('.pi-bot-sheet[open] .pi-bot-sheet-link').filter({ hasText: '再点一次确认' }).click();
            assert.deepEqual([await open(), await page.evaluate(() => s.restart)], [1, 0], 'meeting again warns first too');
            await page.locator('.pi-bot-sheet[open] .pi-bot-sheet-link').filter({ hasText: '再点一次确认' }).click();
            assert.deepEqual([await open(), await page.evaluate(() => s.restart)], [0, 1]);
            await openSettings();
            await page.locator('.pi-bot-sheet[open] .pi-bot-sheet-close').click();
            assert.equal(await open(), 0, 'nothing edited: closes at once');

            // 5. The notebook editor keeps the draft after a failed save; exact due times show and edit (UAT-10/12).
            await load('pi-bot-notebook.js');
            await page.evaluate(({ profileId, windowId }) => {
                // The conflict comes with another device's change to a field the user is not editing.
                window.n = { writes: [], failures: ['SESSION_BUSY', 'NETWORK', { code: 'NOTEBOOK_CHANGED', due: '2026-11-06T18:00:00+08:00' }], version: 1 };
                const item = { id: 'n1', kind: 'commitment', text: '原来的承诺', due: '2026-11-06T17:30:00+08:00', status: 'active', by: 'bot', supersedes: null,
                    createdAt: '2026-10-26T06:00:00Z', updatedAt: '2026-10-26T06:00:00Z', source: null };
                const book = () => ({ generation: 0, version: `v${n.version}`, items: [{ ...item }] });
                PiBotNotebook.open({ profileId, windowId, name: '小狸', face: () => document.createElement('span'), api: async (_url, options) => {
                    if (!options) return book();
                    const body = JSON.parse(options.body); n.writes.push(body);
                    const failure = n.failures.shift();
                    if (failure === 'NETWORK') throw new Error('Failed to fetch');
                    if (failure?.code === 'NOTEBOOK_CHANGED') { const { code, ...change } = failure; Object.assign(item, change); n.version++; throw Object.assign(new Error('changed'), { code }); }
                    if (failure) throw Object.assign(new Error('busy'), { code: failure });
                    for (const op of body.ops) { if (op.text) item.text = op.text; if (op.due !== undefined) item.due = op.due; }
                    n.version++; return book();
                } });
            }, { profileId: BOT, windowId: MAIN });
            await page.locator('[data-note-id="n1"]').waitFor();
            const meta = () => page.locator('[data-note-id="n1"] .pi-bot-note-meta').textContent();
            assert.match(await meta(), /截止 11月6日 17:30/);
            const edit = () => page.locator('[data-note-id="n1"] [data-note-action="edit"]').first().evaluate(node => node.click());
            await edit();
            assert.deepEqual([await page.locator('[data-note-field="due"]').inputValue(), await page.locator('[data-note-field="time"]').inputValue()], ['2026-11-06', '17:30']);
            await page.locator('[data-note-field="text"]').fill('用户刚刚修改但还未保存的承诺');
            for (const expected of [/正在回复，你的修改还在/, /没保存成功，你的修改还在/, /已刷新；你的修改还在/]) {
                await page.locator('[data-note-action="edit-save"]').click();
                await page.locator('.pi-bot-sheet-status').filter({ hasText: expected }).waitFor();
                assert.equal(await page.locator('[data-note-field="text"]').inputValue(), '用户刚刚修改但还未保存的承诺', String(expected));
            }
            assert.equal(await page.locator('[data-note-field="time"]').inputValue(), '18:00', 'the untouched time follows the other device');
            await shot('bot-notes-kept-draft');
            await page.locator('[data-note-action="edit-save"]').click();
            await page.waitForFunction(() => !document.querySelector('[data-note-field="text"]'));
            assert.deepEqual(await page.evaluate(() => n.writes.map(body => body.ops)), Array(4).fill([{ op: 'update', id: 'n1', text: '用户刚刚修改但还未保存的承诺' }]),
                'only the text is sent: the exact time stays as stored, and the other device\'s change is not undone');
            assert.equal(await page.evaluate(() => n.writes.at(-1).expectedVersion), 'v2', 'the retry after the refresh names the new version');
            assert.match(await meta(), /截止 11月6日 18:00/);
            // The other way round: a time-only edit keeps the text another device changed meanwhile.
            await page.evaluate(() => n.failures.push({ code: 'NOTEBOOK_CHANGED', text: '别的设备改过的承诺' }));
            await edit();
            await page.locator('[data-note-field="time"]').fill('19:00');
            await page.locator('[data-note-action="edit-save"]').click();
            await page.locator('.pi-bot-sheet-status').filter({ hasText: /已刷新；你的修改还在/ }).waitFor();
            assert.deepEqual([await page.locator('[data-note-field="text"]').inputValue(), await page.locator('[data-note-field="time"]').inputValue()], ['别的设备改过的承诺', '19:00']);
            await page.locator('[data-note-action="edit-save"]').click();
            await page.waitForFunction(() => !document.querySelector('[data-note-field="time"]'));
            assert.deepEqual(await page.evaluate(() => n.writes.at(-1).ops), [{ op: 'update', id: 'n1', due: '2026-11-06T19:00+08:00' }]);
            assert.match(await meta(), /截止 11月6日 19:00/);
            assert.match(await page.locator('[data-note-id="n1"]').textContent(), /别的设备改过的承诺/);
            await edit();
            await page.locator('[data-note-field="due"]').fill('');
            assert.equal(await page.locator('[data-note-field="time"]').isDisabled(), true);
            await page.locator('[data-note-action="edit-save"]').click();
            await page.waitForFunction(() => !document.querySelector('[data-note-field="due"]'));
            assert.deepEqual(await page.evaluate(() => n.writes.at(-1).ops), [{ op: 'update', id: 'n1', due: null }]);

            // 6. The selection menu on the Bot page has no side-chat entry (UAT-05).
            await load('pi-selection-actions.js');
            await page.evaluate(() => {
                document.querySelector('#forms').innerHTML = '<div id="pi-transcript"><article class="pi-message assistant"><div class="pi-markdown"><p id="said">卫生间瓷砖定哑光灰</p></div></article></div>';
                window.sel = { side: 0 };
                window.actions = new PiSelectionActions({ context: () => ({ connected: true, key: 'k' }), sideEnabled: () => true, sideHidden: () => window.botPage,
                    addMain: () => {}, addSide: () => { sel.side++; }, toast: () => {} });
            });
            const menuFor = async botPage => {
                await page.evaluate(botPage => { window.botPage = botPage; const range = document.createRange(); range.selectNodeContents(document.querySelector('#said'));
                    getSelection().removeAllRanges(); getSelection().addRange(range); return actions.capture(); }, botPage);
                return page.locator('.pi-selection-menu [data-selection-action="side"]').isVisible();
            };
            assert.equal(await menuFor(true), false, 'no side chat on the Bot page');
            assert.equal(await menuFor(false), true, 'Pi Agent keeps it');

            assert.deepEqual(errors, [], `page errors at ${width}`);
            await context.close();
        }

        // 7. A time the device's clock skips (daylight saving starts) is refused, not saved as another moment.
        {
            const context = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'zh-CN', timezoneId: 'America/New_York' });
            const page = await context.newPage(), errors = [];
            page.setDefaultTimeout(8000);
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`${base}/__forms`); await page.addScriptTag({ url: `${base}/pi-bot-notebook.js` });
            await page.evaluate(() => {
                window.n = { writes: [] };
                const item = { id: 'n1', kind: 'commitment', text: '交报价', due: null, status: 'active', by: 'bot', supersedes: null,
                    createdAt: '2026-03-01T06:00:00Z', updatedAt: '2026-03-01T06:00:00Z', source: null };
                PiBotNotebook.open({ profileId: '11111111-1111-4111-8111-111111111111', windowId: '22222222-2222-4222-8222-222222222222', name: '小狸',
                    face: () => document.createElement('span'), api: async (_url, options) => {
                        if (options) { const body = JSON.parse(options.body); n.writes.push(body.ops); Object.assign(item, { due: body.ops[0].due }); }
                        return { generation: 0, version: `v${n.writes.length}`, items: [{ ...item }] };
                    } });
            });
            await page.locator('[data-note-id="n1"] [data-note-action="edit"]').first().evaluate(node => node.click());
            await page.locator('[data-note-field="due"]').fill('2026-03-08');
            await page.locator('[data-note-field="time"]').fill('02:30');
            await page.locator('[data-note-action="edit-save"]').click();
            await page.locator('.pi-bot-sheet-status').filter({ hasText: '这个时间在这台设备的时区里不存在' }).waitFor();
            assert.equal(await page.evaluate(() => n.writes.length), 0);
            await page.locator('[data-note-field="time"]').fill('03:30');
            await page.locator('[data-note-action="edit-save"]').click();
            await page.waitForFunction(() => n.writes.length === 1);
            assert.deepEqual(await page.evaluate(() => n.writes[0]), [{ op: 'update', id: 'n1', due: '2026-03-08T03:30-04:00' }]);
            assert.deepEqual(errors, []);
            await context.close();
        }
        console.log('Bot forms keep the user\'s choices and drafts at desktop and phone widths');
    } finally {
        await browser?.close();
        server.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
