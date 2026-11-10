// Real avatar, settings, setup and task-card modules against synthetic APIs; no live identity.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { settingsPage } = require('./pi-bot-fixture.js');
const root = path.join(__dirname, '../../public');
const styles = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
const BOT = '11111111-1111-4111-8111-111111111111';
(async () => {
    const app = express();
    app.get('/fixture', (_req, res) => res.type('html').send(`<!doctype html><html lang="zh-CN" data-theme="daylight"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(s => `<link rel="stylesheet" href="/${s}">`).join('')}</head><body><main id="fixture" style="width:min(760px,100%);padding:12px;margin:auto"></main></body></html>`));
    app.use(express.static(root)); const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393]) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
            const page = await context.newPage(), errors = []; page.setDefaultTimeout(8000);
            page.on('pageerror', e => errors.push(e.message));
            const base = `http://127.0.0.1:${server.address().port}`;
            await page.goto(`${base}/fixture`);
            for (const script of ['pi-avatar-presets.js', 'pi-avatar.js', 'pi-bot-motion.js', 'pi-bot.js', 'pi-bot-settings.js', 'pi-bot-schedule-cards.js'])
                await page.addScriptTag({ url: `${base}/${script}` });
            await page.evaluate(id => {
                window.x = { revision: 'r1', writes: [], fails: 0, responses: [], laterFails: 0,
                    profile: { id, name: 'CC', avatar: { kind: 'preset', id: 'pivane-tile' }, soul: '', bot: { job: '', model: null, permissions: { preset: 'free' }, onboarding: { phase: 'interview', steps: {} } } } };
                x.api = async (_url, options) => {
                    if (!options) return { revision: x.revision, bot: structuredClone(x.profile), models: { models: [] } };
                    const body = JSON.parse(options.body);
                    if (_url.endsWith('/avatar')) {
                        x.uploadData = body.dataUrl;
                        x.uploads = (x.uploads || 0) + 1; x.profile.avatar = { kind: 'image', version: 'a'.repeat(64) }; x.revision += 'u';
                        return { ok: true, revision: x.revision, profile: structuredClone(x.profile) };
                    }
                    x.writes.push(body);
                    if (x.fails-- > 0) { x.revision = 'r2'; x.profile.soul = 'changed elsewhere'; throw Object.assign(new Error('synthetic conflict'), { status: 409 }); }
                    assertRevision(body.expectedRevision);
                    Object.assign(x.profile, body.changes); x.revision += 'x'; return { ok: true, revision: x.revision };
                };
                function assertRevision(revision) { if (revision !== x.revision) throw new Error('wrong revision'); }
                x.open = () => PiBotSettings.open({ api: x.api, profileId: id, face: PiBot.face, toast() {} });
            }, BOT);
            const sheet = () => page.locator('.pi-bot-sheet[open]');
            const partOption = (field, id) => sheet().locator(`[data-avatar-part="${field}"] button[data-avatar-option="${id}"]`);
            const selectedPart = field => sheet().locator(`[data-avatar-part="${field}"] [aria-pressed="true"]`).getAttribute('data-avatar-option');
            const openSettings = async () => {
                await page.evaluate(() => x.open());
                await settingsPage(sheet(), 'profile');
                await sheet().locator('[data-avatar-tab="preset"]').click();
            };
            // All presets roundtrip through the same avatar field and preview before Save.
            for (const id of ['ohmybuddy-sunny', 'ohmybuddy-mochi', 'ohmybuddy-boo', 'pivane-pebble', 'pivane-bean', 'pivane-tile']) {
                await openSettings();
                await sheet().locator(`[data-avatar-preset="${id}"]`).click();
                assert.equal(await sheet().locator('.pi-bot-sheet-avatar-face .pi-preset-svg').getAttribute('data-preset'), id);
                assert.equal(await page.evaluate(() => x.profile.avatar.kind), 'preset', 'preview does not save');
                await sheet().locator('.pi-bot-sheet-save').click(); await page.waitForFunction(() => !document.querySelector('.pi-bot-sheet[open]'));
                assert.deepEqual(await page.evaluate(() => x.writes.at(-1).changes), { avatar: { kind: 'preset', id } });
            }
            // Refresh reads the persisted choice; an unrelated name change preserves it.
            await openSettings();
            assert.equal(await sheet().locator('[data-avatar-preset="pivane-tile"]').getAttribute('aria-pressed'), 'true');
            await sheet().locator('input[required]').fill('New CC'); await sheet().locator('.pi-bot-sheet-save').click();
            await page.waitForFunction(() => !document.querySelector('.pi-bot-sheet[open]'));
            assert.deepEqual(await page.evaluate(() => x.writes.at(-1).changes), { name: 'New CC' });
            // Cancel warns once, then discards the selected preset.
            await openSettings(); await sheet().locator('[data-avatar-preset="pivane-bean"]').click();
            await sheet().locator('.pi-bot-sheet-close').click(); assert.equal(await sheet().count(), 1);
            await sheet().locator('.pi-bot-sheet-close').click();
            assert.equal(await page.evaluate(() => x.profile.avatar.id), 'pivane-tile');
            // A conflict preserves the one face draft while untouched fields follow the server.
            await page.evaluate(() => { x.fails = 1; });
            await openSettings();
            await sheet().locator('[data-avatar-preset="pivane-bean"]').click(); await sheet().locator('.pi-bot-sheet-save').click();
            await sheet().locator('.pi-bot-sheet-status').filter({ hasText: '修改还在' }).waitFor();
            assert.equal(await sheet().locator('[data-avatar-preset="pivane-bean"]').getAttribute('aria-pressed'), 'true');
            assert.equal(await sheet().locator('textarea').nth(1).inputValue(), 'changed elsewhere');
            if (process.env.PI_BOT_EVIDENCE) await page.screenshot({ path: path.join(process.env.PI_BOT_EVIDENCE, `preset-settings-${width}.png`) });
            await sheet().locator('.pi-bot-sheet-save').click(); await page.waitForFunction(() => !document.querySelector('.pi-bot-sheet[open]'));
            assert.deepEqual(await page.evaluate(() => x.writes.at(-1).changes), { avatar: { kind: 'preset', id: 'pivane-bean' } });
            // The complete catalog and pictures share the draft, without an emoji input.
            await openSettings();
            assert.equal(await sheet().locator('[data-sheet-emoji]').count(), 0);
            assert.equal(await sheet().locator('.pi-bot-sheet-emoji').count(), 0);
            assert.equal(await sheet().locator('[data-avatar-preset]').count(), 24);
            assert.equal(await sheet().locator('.pi-avatar-caption').innerText(), '豆豆');
            const sunny = sheet().locator('[data-avatar-preset="ohmybuddy-sunny"]');
            await sunny.hover();
            assert.equal(await sunny.locator('[data-avatar-state="greeting"][data-avatar-live="true"]').count(), 1);
            await sheet().locator('[data-avatar-tab="preset"]').focus();
            await page.mouse.move(0, 0);
            assert.equal(await sunny.locator('[data-avatar-live="true"]').count(), 0);
            await sunny.focus();
            assert.equal(await sunny.locator('[data-avatar-state="greeting"][data-avatar-live="true"]').count(), 1);
            await sheet().locator('.pi-bot-sheet-close').click();
            const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 8; return c.toDataURL().split(',')[1]; }), 'base64');
            // Composition stays local, supports compatible parts/locks/undo and survives a conflict.
            await openSettings();
            await sheet().locator('[data-avatar-tab="compose"]').click();
            assert.equal(await sheet().locator('[data-avatar-tab="compose"]').innerText(), '自己搭');
            assert.equal(await sheet().locator('[data-avatar-part][role="group"]').count(), 5);
            assert.equal(await partOption('palette', 'legacy-bean').isHidden(), false);
            assert.equal(await partOption('palette', 'legacy-pebble').isHidden(), true);
            await partOption('shape', 'egg').click();
            assert.equal(await partOption('decoration', 'bunny').isDisabled(), false);
            await partOption('decoration', 'bunny').click();
            await partOption('shape', 'onigiri').click();
            assert.equal(await partOption('decoration', 'headphones').isDisabled(), true);
            await partOption('shape', 'drop').click();
            assert.equal(await selectedPart('decoration'), 'none', 'incompatible accessories clear when the shape changes');
            await partOption('palette', 'blue').click();
            await partOption('eyes', 'oval').click();
            assert.equal(await partOption('palette', 'legacy-bean').isHidden(), true);
            for (const id of ['sprout', 'cat', 'bunny', 'headphones']) assert.equal(await partOption('decoration', id).isDisabled(), true, id);
            for (const id of ['blush', 'halo', 'glasses']) assert.equal(await partOption('decoration', id).isDisabled(), false, id);
            assert.match(await partOption('decoration', 'sprout').getAttribute('title'), /这个形状戴不了/);
            assert.equal(await page.evaluate(() => x.profile.avatar.kind), 'preset');
            assert.equal(await sheet().locator('.pi-avatar-caption').innerText(), '水滴 · 雾蓝');
            const overflow = await sheet().locator('[data-avatar-part]').evaluateAll(groups => groups.flatMap(group => [...group.children])
                .filter(node => !node.hidden).filter(node => { const box = node.getBoundingClientRect(); return box.width <= 0 || box.left < -1 || box.right > innerWidth + 1; }).map(node => node.dataset.avatarOption));
            assert.deepEqual(overflow, [], 'part buttons fit the viewport');
            await sheet().locator('[data-avatar-lock="shape"]').click();
            assert.equal(await sheet().locator('[data-avatar-lock="shape"]').getAttribute('aria-pressed'), 'true');
            await sheet().locator('[data-avatar-random]').click();
            assert.equal(await selectedPart('shape'), 'drop');
            assert.notEqual(await selectedPart('mouth'), 'none');
            await sheet().locator('[data-avatar-undo]').click();
            assert.equal(await selectedPart('eyes'), 'oval');
            assert.equal(await sheet().locator('.pi-avatar-caption').innerText(), '水滴 · 雾蓝');
            const previewStates = sheet().getByRole('group', { name: '预览形象状态', exact: true });
            assert.equal(await previewStates.locator('button').count(), 8);
            for (const state of ['thinking', 'working', 'done', 'failed', 'sleeping', 'greeting', 'idle', 'waiting']) {
                await previewStates.locator(`[data-avatar-state-option="${state}"]`).click();
                assert.equal(await sheet().locator('.pi-avatar-stage > span').getAttribute('data-avatar-state'), state);
                assert.equal(await previewStates.locator('[aria-pressed="true"]').getAttribute('data-avatar-state-option'), state);
            }
            assert.equal(await sheet().locator('.pi-avatar-stage .avatar-badge.is-waiting').evaluate(n => getComputedStyle(n).display), 'inline');
            if (process.env.PI_BOT_EVIDENCE) await page.screenshot({ path: path.join(process.env.PI_BOT_EVIDENCE, `avatar-composition-${width}.png`) });
            await previewStates.locator('[data-avatar-state-option="idle"]').click();
            await page.waitForFunction(() => document.querySelector('.pi-avatar-stage > span')?.dataset.avatarLive === 'true');
            assert.equal(await sheet().locator('.pi-avatar-stage .avatar-breath').evaluate(node => getComputedStyle(node).animationName), 'avatar-breathe');
            await sheet().locator('.pi-avatar-stage').click();
            await sheet().locator('.pi-avatar-stage .pi-preset-svg.is-poked').waitFor({ state: 'attached' });
            await page.mouse.move(width - 10, 10);
            await page.waitForFunction(() => parseFloat(document.querySelector('.pi-avatar-stage .pi-preset-svg')?.style.getPropertyValue('--avatar-look-x')) > 0);
            await sheet().locator('.pi-avatar-motion-choice').click();
            assert.equal(await sheet().getByRole('checkbox', { name: '播放形象动画' }).isChecked(), false);
            assert.equal(await sheet().locator('.pi-avatar-stage .avatar-breath').evaluate(node => getComputedStyle(node).animationName), 'none');
            assert.equal(await page.evaluate(() => localStorage.getItem('ohmybuddy-avatar-motion')), 'off');
            await sheet().locator('.pi-avatar-motion-choice').click();
            assert.equal(await sheet().getByRole('checkbox', { name: '播放形象动画' }).isChecked(), true);
            await page.evaluate(() => { x.fails = 1; });
            await sheet().locator('.pi-bot-sheet-save').click();
            await sheet().locator('.pi-bot-sheet-status').filter({ hasText: '修改还在' }).waitFor();
            await sheet().locator('[data-avatar-tab="compose"]').click();
            assert.equal(await selectedPart('shape'), 'drop');
            await sheet().locator('.pi-bot-sheet-save').click();
            await page.waitForFunction(() => !document.querySelector('.pi-bot-sheet[open]'));
            assert.equal(await page.evaluate(() => x.profile.avatar.kind), 'composed');
            await openSettings();
            assert.equal(await selectedPart('shape'), 'drop');
            assert.equal(await sheet().locator('.pi-bot-sheet-save').isDisabled(), true);
            await sheet().locator('.pi-bot-sheet-close').click();
            await openSettings();
            await sheet().locator('[data-sheet-picture-file]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: png });
            await sheet().locator('.pi-bot-sheet-avatar-face img[src^="data:"]').waitFor();
            await sheet().locator('[data-avatar-tab="preset"]').click();
            await sheet().locator('[data-avatar-preset="pivane-tile"]').click();
            await sheet().locator('.pi-bot-sheet-save').click(); await page.waitForFunction(() => !document.querySelector('.pi-bot-sheet[open]'));
            assert.equal(await page.evaluate(() => x.uploads || 0), 0, 'replacing the local picture with a preset does not upload it');
            await openSettings();
            await sheet().locator('[data-sheet-picture-file]').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: png });
            await sheet().locator('.pi-bot-sheet-avatar-face img[src^="data:"]').waitFor();
            await sheet().locator('.pi-bot-sheet-save').click(); await page.waitForFunction(() => !document.querySelector('.pi-bot-sheet[open]'));
            assert.deepEqual(await page.evaluate(() => x.profile.avatar), { kind: 'image', version: 'a'.repeat(64) });
            // Review R1: decoding a second image reserves the draft before any await.
            const secondPng = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 8; c.getContext('2d').fillRect(0, 0, 8, 8); return c.toDataURL().split(',')[1]; }), 'base64');
            await page.evaluate(() => {
                x.originalBitmap = window.createImageBitmap; x.bitmap = window.createImageBitmap.bind(window);
                window.createImageBitmap = async file => { if (file.name === 'second.png') await new Promise(resolve => { x.decodeSecond = resolve; }); return x.bitmap(file); };
                x.fails = 1;
            });
            await openSettings();
            await sheet().locator('[data-sheet-picture-file]').setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: png });
            await sheet().locator('.pi-bot-sheet-avatar-face img[src^="data:"]').waitFor();
            const beforeUploads = await page.evaluate(() => x.uploads);
            await sheet().locator('[data-sheet-picture-file]').setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: secondPng });
            assert.equal(await sheet().locator('.pi-bot-sheet-save').isDisabled(), true, 'Save waits for the selected picture to decode');
            await sheet().locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
            assert.equal(await page.evaluate(() => x.uploads), beforeUploads, 'a direct submit cannot bypass decoding reservation');
            await page.evaluate(() => x.decodeSecond());
            await page.waitForFunction(() => !document.querySelector('.pi-bot-sheet[open] .pi-bot-sheet-save').disabled);
            const selectedPicture = await sheet().locator('.pi-bot-sheet-avatar-face img').getAttribute('src');
            await sheet().locator('.pi-bot-sheet-save').click();
            await sheet().locator('.pi-bot-sheet-status').filter({ hasText: '修改还在' }).waitFor();
            assert.equal(await page.evaluate(() => x.uploadData), selectedPicture, 'the uploaded bytes identify the selected picture');
            await sheet().locator('.pi-bot-sheet-save').click(); await page.waitForFunction(() => !document.querySelector('.pi-bot-sheet[open]'));
            assert.equal(await page.evaluate(() => x.uploads), beforeUploads + 1, 'the retry uses only the matching submitted picture/version cache');
            await page.evaluate(() => { window.createImageBitmap = x.originalBitmap; });
            // The first-meeting card protects a chosen preset, then accepts a user's new choice.
            await page.evaluate(() => {
                x.identity = { id: x.profile.id, name: 'CC', avatar: { kind: 'preset', id: 'pivane-pebble' }, chosen: { name: true, avatar: true }, phase: 'interview' };
                x.card = PiBot.setupCards({ enabled: () => true, calls: () => [{ id: 'setup1', args: { avatar: '✨' } }], identity: () => x.identity,
                    face: () => PiBot.face(x.identity), respond: value => x.responses.push(value), changed() {},
                    later: async () => { if (x.laterFails-- > 0) throw new Error('later save failed'); },
                    save: async (_id, changes) => x.writes.push(changes) });
                document.querySelector('#fixture').append(x.card.element);
                x.card.sync(new Map([['select', { id: 'select', method: 'select', title: '保存这些设置？ / Save these settings?', options: ['保存 / Save', '先不改 / Not now'] }]]), true);
            });
            assert.equal(await page.locator('[data-setup-use="avatar"]').isChecked(), false);
            await page.locator('.pi-bot-setup [data-avatar-preset="pivane-tile"]').click();
            assert.equal(await page.locator('[data-setup-use="avatar"]').isChecked(), true);
            await page.locator('.pi-bot-setup-save').click();
            assert.deepEqual(await page.evaluate(() => x.writes.at(-1)), { avatar: { kind: 'preset', id: 'pivane-tile' } });
            await page.evaluate(() => {
                x.responses = []; x.laterFails = 1;
                x.card.sync(new Map([['select2', { id: 'select2', method: 'select', title: '保存这些设置？ / Save these settings?', options: ['保存 / Save', '先不改 / Not now'] }]]), true);
            });
            await page.locator('.pi-bot-setup-later').click();
            await page.locator('.pi-bot-setup-note.is-error').filter({ hasText: 'later save failed' }).waitFor();
            assert.deepEqual(await page.evaluate(() => x.responses), []);
            await page.locator('.pi-bot-setup-later').click();
            assert.deepEqual(await page.evaluate(() => x.responses), [{ id: 'select2', value: '先不改 / Not now' }]);
            // Personality quick picks fill editable text; a different proposed way of working shows the three
            // modes, and only this card's fields are saved.
            await page.evaluate(() => {
                x.card.element.remove();
                x.card = PiBot.setupCards({ enabled: () => true, calls: () => [{ id: 'style', args: { personality: '草稿', workStyle: 'ask' } }],
                    identity: () => ({ ...x.identity, workStyle: 'free' }), face: () => PiBot.face(x.identity), respond() {}, changed() {},
                    save: async (_id, changes) => x.writes.push(changes) });
                document.querySelector('#fixture').append(x.card.element);
                x.card.sync(new Map([['style', { id: 'style', method: 'select', title: '保存这些设置？ / Save these settings?', options: ['保存 / Save', '先不改 / Not now'] }]]), true);
            });
            assert.equal(await page.locator('[data-setup-work]').count(), 3);
            await page.getByRole('button', { name: '温柔耐心', exact: true }).click();
            await page.locator('[data-setup-field="personality"]').fill('温柔但简短');
            await page.locator('[data-setup-work="balanced"]').check();
            await page.locator('.pi-bot-setup-save').click();
            assert.deepEqual(await page.evaluate(() => x.writes.at(-1)), { personality: '温柔但简短', workStyle: 'balanced' });
            // Unknown saved references have a static fallback and are not rewritten by rendering.
            await page.evaluate(() => {
                const host = document.querySelector('#fixture'); host.replaceChildren();
                for (const id of ['pivane-pebble', 'pivane-bean', 'pivane-tile', 'pivane-missing'])
                    for (const size of ['xs', 'sm', 'md', 'lg', 'xl']) host.append(PiBot.face({ avatar: { kind: 'preset', id } }, size));
            });
            assert.equal(await page.locator('[data-missing-preset]').count(), 5);
            assert.equal(await page.locator('[data-avatar-live="true"]').count(), 0, 'list/message copies are static');
            // Runtime motion, dark theme, reduced motion and badges remain inside the viewport.
            await page.evaluate(() => {
                const live = PiBot.face({ avatar: { kind: 'preset', id: 'pivane-pebble' } }, 'xl'); live.id = 'live'; document.querySelector('#fixture').prepend(live);
                x.motion = PiBotMotion.create({ paint: value => { live.dataset.avatarState = value.state; live.dataset.avatarLive = String(value.live); } });
                x.motion.update({ key: 'one', connected: true, waiting: true, working: true });
                document.documentElement.dataset.theme = 'dark';
            });
            assert.equal(await page.locator('#live').getAttribute('data-avatar-state'), 'waiting');
            assert.equal(await page.locator('#live .avatar-badge.is-waiting').evaluate(n => getComputedStyle(n).display), 'inline');
            assert.equal(await page.locator('#live .avatar-body').evaluate(n => getComputedStyle(n).fill), 'rgb(198, 209, 221)');
            await page.emulateMedia({ reducedMotion: 'reduce' });
            assert.equal(await page.locator('#live .avatar-motion').evaluate(n => getComputedStyle(n).animationName), 'none');
            if (process.env.PI_BOT_EVIDENCE) await page.screenshot({ path: path.join(process.env.PI_BOT_EVIDENCE, `preset-sizes-dark-${width}.png`) });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            // All shape/eye families keep readable static poses and unique local SVG clip references.
            const failures = await page.evaluate(() => {
                const host = document.querySelector('#fixture'); host.replaceChildren(); const failures = [], clipIds = new Set();
                for (const shape of PiAvatarPresets.shapes) for (const eyes of PiAvatarPresets.eyes) {
                    const value = { ...PiAvatarPresets.find('ohmybuddy-mint').recipe, shape: shape.id, eyes: eyes.id };
                    const face = PiAvatar.render({ avatar: value }, 'pi-bot-face is-xl'); host.append(face);
                    for (const state of PiBotMotion.states) {
                        face.dataset.avatarState = state;
                        const expected = state === 'sleeping' ? '.avatar-closed' : state === 'failed' ? '.avatar-sad'
                            : ['done', 'greeting'].includes(state) ? '.avatar-happy' : '.avatar-normal';
                        if (getComputedStyle(face.querySelector(expected)).display === 'none') failures.push([shape.id, eyes.id, state]);
                    }
                    const clip = face.querySelector('clipPath');
                    if (!clip?.id || clipIds.has(clip.id) || face.querySelectorAll('[id]').length !== 1
                        || face.querySelector('.avatar-skin')?.getAttribute('clip-path') !== `url(#${clip?.id})`) failures.push(['clip-reference', shape.id, eyes.id]);
                    clipIds.add(clip?.id);
                    if (face.hasAttribute('data-avatar-live')) failures.push(['static', shape.id]);
                    face.remove();
                }
                for (const preset of PiAvatarPresets.presets) host.append(PiAvatar.render({ avatar: { kind: 'preset', id: preset.id } }, 'pi-bot-face is-xl'));
                const ids = [...host.querySelectorAll('[id]')].map(node => node.id);
                if (new Set(ids).size !== ids.length) failures.push(['shared-clip-id']);
                host.style.display = 'grid'; host.style.gridTemplateColumns = 'repeat(3,minmax(0,1fr))'; host.style.gap = '16px';
                return failures;
            });
            assert.deepEqual(failures, []);
            if (process.env.PI_BOT_EVIDENCE) await page.screenshot({ path: path.join(process.env.PI_BOT_EVIDENCE, `avatar-catalog-dark-${width}.png`) });
            await page.evaluate(() => { const host = document.querySelector('#fixture'); host.style.display = ''; host.style.gridTemplateColumns = ''; host.style.gap = ''; });
            // A successful schedule tool result produces a card with the real job id and route.
            await page.evaluate(id => {
                const job = { id, title: '今晚复习', message: '复习数学第 2 章', schedule: { kind: 'once', at: Date.parse('2026-11-01T19:00:00+08:00'), timeZone: 'Asia/Shanghai' }, enabled: true, revision: 1 };
                x.routes = []; x.owner = 'one'; x.generation = 1; x.taskWrites = [];
                window.PiWorkspaceRoute = { navigate: (tab, params) => x.routes.push({ tab, params }) };
                window.PiProfileDialog = { confirm: async () => true };
                x.cards = PiBotScheduleCards.create({ context: () => x.owner, generation: () => x.generation, api: async (_url, options) => {
                    if (!options) { if (x.holdTaskRead) await new Promise(resolve => { x.releaseTaskRead = resolve; }); return { jobs: [{ id, name: job.title, revision: 2 }] }; }
                    x.taskWrites.push(JSON.parse(options.body)); return {};
                }, notify() {} });
                x.mountTask = call => {
                    const card = x.cards.render({ toolName: 'bot_schedule', toolCallId: call, details: { pivaneBotSchedule: { v: 1, action: 'created', job } } });
                    document.querySelector('#fixture').replaceChildren(card);
                };
                x.mountTask('scheduled1');
            }, BOT);
            assert.match(await page.locator('.pi-bot-schedule-card').innerText(), /今晚复习[\s\S]*19:00[\s\S]*Asia\/Shanghai/);
            await page.evaluate(() => { x.generation++; }); // Same conversation, retained DOM after reconnect.
            await page.getByRole('button', { name: '查看 / 修改' }).click();
            assert.deepEqual(await page.evaluate(() => x.routes), [{ tab: 'cron', params: { jobId: BOT } }]);
            await page.getByRole('button', { name: '取消任务', exact: true }).click();
            await page.waitForFunction(() => x.taskWrites.length === 1);
            assert.deepEqual(await page.evaluate(() => x.taskWrites), [{ revision: 2, action: 'delete' }]);
            await page.evaluate(() => { x.mountTask('scheduled2'); x.holdTaskRead = true; });
            await page.getByRole('button', { name: '取消任务', exact: true }).click();
            await page.waitForFunction(() => typeof x.releaseTaskRead === 'function');
            await page.evaluate(() => { x.owner = 'other'; x.generation++; x.owner = 'one'; x.generation++; x.releaseTaskRead(); });
            await page.waitForFunction(() => !document.querySelector('.pi-bot-schedule-cancel').disabled);
            assert.equal(await page.evaluate(() => x.taskWrites.length), 1, 'a switch away/back cannot revive an old cancellation operation');
            if (process.env.PI_BOT_EVIDENCE) await page.screenshot({ path: path.join(process.env.PI_BOT_EVIDENCE, `schedule-card-${width}.png`) });
            assert.deepEqual(errors, [], 'no browser pageerrors');
            await context.close();
        }
        console.log('Preset selection, conflict/cancel, static rendering, motion and schedule cards passed at 1440/393.');
    } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
