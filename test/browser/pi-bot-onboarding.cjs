// The end of getting acquainted (public/pi-bot-onboarding.js, flow 2): a local explanation of
// how the Bot works and where things are kept, an optional model choice from the settings list
// that is never claimed as saved after a failure or conflict, and first-task chips that send a
// message only when clicked (never over a draft, also one typed while the choice is saved).
// On phones the panel is bounded, folds the facts and keeps every choice in view, so the Bot's
// closing reply stays readable; a message of the user's own makes it step aside on this page.
// Finished older Bots are not asked again.
// Synthetic backend (pi-bot-fixture.js); desktop, phone and narrow phone; dark and reduced motion.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, say, serve, botRecord, botPage, newWorld, layout, bottomBar, settledShot } = require('./pi-bot-fixture.js');

const MODELS = { defaults: { provider: 'fixture', modelId: 'small', thinkingLevel: 'medium' }, models: [
    { provider: 'fixture', id: 'small', name: 'Small', thinkingLevels: [] },
    { provider: 'fixture', id: 'large', name: 'Large', thinkingLevels: ['low', 'high'] }] };
const CLOSING = '好，我们算是认识了。';

(async () => {
    const { base, close } = await serve();
    const evidence = process.env.PI_BOT_EVIDENCE;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
        for (const width of [1440, 393, 320]) {
            const phone = width < 700;
            let onboarding = { version: 1, flowVersion: 2, phase: 'done', firstBot: true, steps: { about: 'done', job: 'done', name: 'done', avatar: 'done' },
                startedAt: '2026-10-24T00:00:00Z', completedAt: '2026-10-24T00:10:00Z' };
            let model = null, thinking = null, revision = 'r1', fails = ['server', 'conflict', 'unavailable'], taskGate = null;
            const posts = [];
            const world = newWorld({
                bots: () => [botRecord({ bot: { model, thinking, onboarding, permissions: { preset: 'balanced', rules: 0 } } })],
                messages: () => [say('user', '就这些啦', '2026-10-26T06:00:00Z'), say('assistant', CLOSING, '2026-10-26T06:00:05Z')]
            });
            Object.defineProperty(world, 'revision', { get: () => revision });
            const api = async ({ pathname, method, body }) => {
                if (pathname === `/api/pi/bots/${BOT}/settings`) return { json: { revision, bot: { id: BOT, name: '小狸', avatar: { kind: 'emoji', value: '🦊' }, soul: '',
                    bot: world.bots()[0].bot }, models: MODELS } };
                if (pathname === `/api/pi/bots/${BOT}/onboarding` && method === 'POST') {
                    posts.push(body);
                    assert.equal(body.expectedRevision, revision);
                    if (body.action === 'model-choice') {
                        const fail = fails.shift();
                        if (fail === 'server') return { status: 500, json: { error: 'Disk full' } };
                        if (fail === 'conflict') { revision = 'r2'; return { status: 409, json: { error: 'Profiles changed' } }; }
                        if (fail === 'unavailable') return { status: 409, json: { error: 'This model is not available; keep the current choice or choose another', code: 'BOT_MODEL_UNAVAILABLE' } };
                        model = body.model; thinking = body.thinking; onboarding = { ...onboarding, steps: { ...onboarding.steps, model: 'done' } };
                    } else if (body.action === 'first-task') {
                        if (taskGate) { const wait = taskGate; taskGate = null; await wait; }
                        onboarding = { ...onboarding, firstTaskChoice: body.choice, steps: { ...onboarding.steps, 'first-task': body.choice === 'later' ? 'skipped' : 'done',
                            ...(onboarding.steps.model ? {} : { model: 'skipped' }) } };
                    }
                    revision = `${revision}+`;
                    return { json: { ok: true, revision, bot: { id: BOT, bot: world.bots()[0].bot } } };
                }
                return undefined;
            };
            const { context, page, errors } = await botPage(browser, base, world, { width, api });
            const shot = async name => { if (evidence) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(evidence, `${name}-${width}.png`) }); } };
            const closure = page.locator('.pi-bot-closure:not([hidden])');
            const refresh = () => page.evaluate(() => window.dispatchEvent(new Event('workspace:agent-profiles-changed')));
            const reopen = async () => {
                onboarding = { ...onboarding, steps: { about: 'done', model: 'done' } }; delete onboarding.firstTaskChoice;
                await refresh();
                await closure.waitFor();
            };
            const turn = async () => {
                world.socket.send(JSON.stringify({ type: 'agent_start' }));
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'working');
                world.socket.send(JSON.stringify({ type: 'agent_end', messages: [] }));
                world.socket.send(JSON.stringify({ type: 'agent_settled' }));
                await page.waitForFunction(() => document.querySelector('#pi-bot-header .pi-bot-status')?.dataset.state === 'connected');
            };
            // Where the panel, its choices, the transcript and the closing reply are on screen.
            const geometry = () => page.evaluate(closing => {
                const rect = node => { const box = node?.getBoundingClientRect(); return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right } : null; };
                const panel = document.querySelector('.pi-bot-closure');
                const reply = [...document.querySelectorAll('#pi-transcript .pi-message.assistant')].find(node => node.textContent.includes(closing));
                return { panel: rect(panel), choices: [...panel.querySelectorAll('[data-closure-task]')].map(node => ({ choice: node.dataset.closureTask, ...rect(node) })),
                    scrolled: Boolean(panel.querySelector('.pi-bot-closure-body [data-closure-task]')), about: panel.querySelector('.pi-bot-closure-about')?.open,
                    transcript: rect(document.getElementById('pi-transcript')), header: rect(document.querySelector('#pi-bot-header .pi-bot-identity')),
                    reply: rect(reply?.querySelector('.pi-message-body')), hero: Boolean(document.querySelector('#pi-transcript .pi-empty-state')), height: innerHeight };
            }, CLOSING);
            // The conversation, not the empty-chat hero, sits above the panel, and on phones the
            // closing reply stays readable between the floating name badge and the panel.
            const readable = async label => {
                await page.locator('#pi-transcript .pi-message.assistant').filter({ hasText: CLOSING }).waitFor();
                await page.waitForTimeout(150);
                const g = await geometry();
                assert.equal(g.hero, false, `${label}: the conversation is shown, not the empty chat`);
                assert.equal(g.scrolled, false, `${label}: the choices are outside the scrolling part`);
                for (const choice of g.choices) assert.ok(choice.top >= g.panel.top - 0.5 && choice.bottom <= g.panel.bottom + 0.5
                    && choice.left >= g.panel.left - 0.5 && choice.right <= g.panel.right + 0.5 && choice.bottom <= g.height, `${label}: "${choice.choice}" is fully inside the panel`);
                if (!phone) return g;
                assert.equal(g.about, false, `${label}: the facts start folded on phones`);
                const room = g.transcript.bottom - g.header.bottom;
                assert.ok(room >= 0.22 * g.height, `${label}: ${Math.round(room)}px of conversation stay readable above the panel`);
                assert.ok(g.reply && g.reply.top >= g.header.bottom - 1 && g.reply.bottom <= g.transcript.bottom + 1, `${label}: the closing reply is fully visible`);
                return g;
            };
            try {
                // 1. Local and transparent: what is kept where, the way of working, honest scope.
                await closure.waitFor();
                assert.equal(await closure.locator('header strong').textContent(), '认识好啦！先说说我平时怎么做事');
                const facts = await closure.locator('.pi-bot-closure-facts').textContent();
                assert.match(facts, /运行 Pivane 的服务机器上/);
                assert.match(facts, /“稳妥”/);
                assert.match(facts, /不是系统沙箱/);
                await closure.locator('[data-closure-model-trigger]').waitFor();
                assert.equal(await closure.locator('[data-closure-model-trigger] .pi-model-trigger-label').textContent(), '跟随默认（Small）');
                assert.deepEqual(world.prompts, [], 'nothing reaches the model by itself');
                if (phone) assert.equal(await closure.locator('[data-closure-model-trigger]').evaluate(node => getComputedStyle(node).fontSize), '16px');
                const box = await closure.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'the panel fits the composer column');
                assert.equal((await layout(page)).overflow, false);
                const first = await readable('first view');
                if (!phone) assert.equal(first.about, true, 'wider screens show the facts');
                if (phone) {
                    const disclosure = await page.evaluate(bot => {
                        const current = { bot, window: { id: 'disclosure-fixture', kind: 'main' }, idle: true };
                        const isolated = window.PiBotOnboarding.closure({ target: () => current, load: async () => null,
                            submit: async () => {}, say: () => false, draft: () => false, face: () => document.createElement('span') });
                        document.body.append(isolated.element); isolated.sync();
                        const old = isolated.element.querySelector('.pi-bot-closure-about');
                        old.open = true; old.dispatchEvent(new Event('toggle'));
                        old.open = false; // The browser's close toggle is still queued when the Bot starts.
                        current.idle = false; isolated.sync(); current.idle = true; isolated.sync();
                        const afterHide = isolated.element.querySelector('.pi-bot-closure-about').open;
                        isolated.hide(); old.open = true; old.dispatchEvent(new Event('toggle'));
                        isolated.sync();
                        const afterDetachedToggle = isolated.element.querySelector('.pi-bot-closure-about').open;
                        isolated.element.remove();
                        return { afterHide, afterDetachedToggle };
                    }, world.bots()[0]);
                    assert.deepEqual(disclosure, { afterHide: false, afterDetachedToggle: false }, 'queued and detached toggle events keep the last visible disclosure choice');
                }
                await shot('bot-closure');
                if (phone) {
                    // Unfolded on request; the choices still stay in view (the facts scroll instead).
                    await closure.locator('.pi-bot-closure-about > summary').click();
                    assert.equal(await closure.locator('.pi-bot-closure-about').evaluate(node => node.open), true);
                    assert.ok(await closure.locator('.pi-bot-closure-about > summary').evaluate(node => node.getBoundingClientRect().height) >= 44);
                    const open = await geometry();
                    for (const choice of open.choices) assert.ok(choice.top >= open.panel.top && choice.bottom <= open.panel.bottom + 0.5, `unfolded: "${choice.choice}" stays in view`);
                    await shot('bot-closure-facts');
                    await closure.locator('.pi-bot-closure-about > summary').click();
                }

                // 2. While the Bot works the panel steps aside; it comes back once idle, over the
                // conversation as the server stored it.
                world.socket.send(JSON.stringify({ type: 'agent_start' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-closure').hidden);
                world.socket.send(JSON.stringify({ type: 'agent_end', messages: [] }));
                world.socket.send(JSON.stringify({ type: 'agent_settled' }));
                await closure.waitFor();
                await readable('after a reply');

                // 3. Model: a failure, a conflict and an unavailable model keep the choice and never
                // claim it was saved; the messages are the user's language.
                await closure.locator('[data-closure-model-trigger]').click();
                const modelDialog = page.locator('#pi-bot-closure-model-dialog[open]');
                await modelDialog.waitFor();
                await modelDialog.locator('.pi-model-all').click();
                await modelDialog.locator('.pi-model-option').filter({ hasText: 'Large' }).click();
                await closure.locator('[data-closure-thinking]').selectOption({ label: '高' });
                await closure.locator('[data-closure-action="model"]').click();
                await closure.locator('.pi-bot-setup-note.is-error').filter({ hasText: '模型没有保存：Disk full' }).waitFor();
                assert.equal(await closure.locator('.pi-bot-closure-saved').count(), 0);
                assert.equal(await closure.locator('[data-closure-model-trigger] .pi-model-trigger-label').textContent(), 'Large');
                assert.equal(await closure.locator('[data-closure-thinking]').inputValue(), 'high');
                await closure.locator('[data-closure-action="model"]').click();
                await closure.locator('.pi-bot-setup-note.is-error').filter({ hasText: '你的选择还在' }).waitFor();
                assert.equal(await closure.locator('[data-closure-thinking]').inputValue(), 'high');
                assert.equal(await closure.locator('.pi-bot-closure-saved').count(), 0);
                await shot('bot-closure-model-conflict');
                await closure.locator('[data-closure-action="model"]').click();
                await closure.locator('.pi-bot-setup-note.is-error').filter({ hasText: '这个模型现在用不了' }).waitFor();
                assert.doesNotMatch(await closure.locator('.pi-bot-setup-note').textContent(), /not available/);
                assert.equal(await closure.locator('[data-closure-thinking]').inputValue(), 'high');
                await closure.locator('[data-closure-action="model"]').click();
                await closure.locator('.pi-bot-closure-saved').filter({ hasText: '用 Large 说话' }).waitFor();
                assert.deepEqual(posts.map(body => [body.action, body.model, body.thinking, body.expectedRevision]), [
                    ['model-choice', { provider: 'fixture', id: 'large' }, 'high', 'r1'],
                    ['model-choice', { provider: 'fixture', id: 'large' }, 'high', 'r1'],
                    ['model-choice', { provider: 'fixture', id: 'large' }, 'high', 'r2'],
                    ['model-choice', { provider: 'fixture', id: 'large' }, 'high', 'r2']], 'each try is the user\'s click, with the reread revision');

                // 4. A first task is sent only on click and never over a draft; the note about the
                // draft leaves once the draft is gone.
                await page.locator('#pi-input').fill('我自己的草稿');
                await closure.locator('[data-closure-task="plan"]').click();
                await closure.locator('.pi-bot-setup-note.is-error').filter({ hasText: '草稿' }).waitFor();
                assert.equal(posts.length, 4, 'the step is not recorded while a draft is in the way');
                assert.equal(await page.locator('#pi-input').inputValue(), '我自己的草稿', 'the draft is untouched');
                await page.locator('#pi-input').fill('');
                await page.waitForFunction(() => !document.querySelector('.pi-bot-closure .pi-bot-setup-note')?.textContent);
                await shot('bot-closure-tasks');
                await closure.locator('[data-closure-task="plan"]').click();
                await page.waitForFunction(() => document.querySelector('.pi-bot-closure').hidden);
                assert.deepEqual(posts.at(-1), { action: 'first-task', choice: 'plan', expectedRevision: 'r2+' });
                for (let i = 0; i < 50 && !world.prompts.length; i++) await page.waitForTimeout(100);
                assert.deepEqual(world.prompts, ['帮我理一理接下来要做的事，排一个轻松可行的计划。']);
                await page.waitForTimeout(300);
                assert.equal(await page.locator('.pi-bot-closure').isHidden(), true, 'the closure ends once the first task is chosen');

                // 5. Text typed while the choice is being saved is kept; the suggestion is then not
                // sent, and the user is told so plainly.
                await reopen();
                let release;
                taskGate = new Promise(resolve => { release = resolve; });
                await closure.locator('[data-closure-task="study"]').click();
                for (let i = 0; i < 50 && posts.at(-1).choice !== 'study'; i++) await page.waitForTimeout(50);
                await page.locator('#pi-input').fill('等我先写完这句');
                release();
                await page.locator('.pi-toast').filter({ hasText: '这条建议没有发出' }).waitFor();
                assert.equal(world.prompts.length, 1, 'no suggestion over a fresh draft');
                assert.equal(await page.locator('#pi-input').inputValue(), '等我先写完这句', 'the draft stays as typed');
                await page.locator('#pi-input').fill('');

                // 6. "Later" ends gently and sends nothing; "my own" just focuses the composer. After
                // a choice, keyboard and mouse users continue in the composer.
                await reopen();
                assert.equal(await closure.locator('.pi-bot-closure-saved').count(), 1, 'a settled model step is shown, not asked again');
                await closure.locator('[data-closure-task="later"]').click();
                await page.locator('.pi-toast').filter({ hasText: '随时跟我说' }).waitFor();
                await page.waitForFunction(() => document.activeElement?.id === 'pi-input');
                assert.equal(posts.at(-1).choice, 'later');
                assert.equal(world.prompts.length, 1);
                await page.locator('#pi-input').blur();
                await reopen();
                await closure.locator('[data-closure-task="own"]').click();
                await page.waitForFunction(() => document.activeElement?.id === 'pi-input');
                assert.equal(posts.at(-1).choice, 'own');
                assert.equal(world.prompts.length, 1);

                // 7. Writing one's own message instead of choosing: the panel steps aside for this page
                // and does not come back after every reply; nothing is recorded for the user.
                await reopen();
                const recorded = posts.length;
                await page.locator('#pi-input').fill('我想先问点别的');
                await page.locator('#pi-send-button').click();
                for (let i = 0; i < 50 && world.prompts.length < 2; i++) await page.waitForTimeout(50);
                assert.deepEqual(world.prompts.at(-1), '我想先问点别的');
                await page.waitForFunction(() => document.querySelector('.pi-bot-closure').hidden);
                await turn();
                await refresh();
                await page.waitForTimeout(400);
                assert.equal(await page.locator('.pi-bot-closure').isHidden(), true, 'not shown again after the reply');
                assert.equal(posts.length, recorded, 'stepping aside is local, never saved');

                // 8. A Bot that finished an older interview is never re-enrolled.
                onboarding = { version: 1, phase: 'done', firstBot: true, steps: { about: 'done' }, startedAt: null, completedAt: '2026-10-20T00:00:00Z' };
                await refresh();
                await page.waitForTimeout(400);
                assert.equal(await page.locator('.pi-bot-closure').isHidden(), true);

                // 9. Dark theme and reduced motion keep the panel readable and still, with the
                // phone's bottom bar in place.
                if (width === 393) {
                    onboarding = { version: 1, flowVersion: 2, phase: 'done', firstBot: true, steps: {}, startedAt: null, completedAt: null };
                    await page.emulateMedia({ reducedMotion: 'reduce' });
                    await page.locator('html').evaluate(node => { node.dataset.theme = 'dark'; });
                    await refresh();
                    await closure.waitFor();
                    assert.equal(await closure.evaluate(node => getComputedStyle(node).animationName), 'none');
                    await readable('dark');
                    assert.deepEqual(await bottomBar(page), { bar: true, active: true, tab: 'bot' }, 'the bottom bar is painted with its active tab');
                    if (evidence) await settledShot(page, path.join(evidence, `bot-closure-dark-reduced-${width}.png`));
                }
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed', posts: posts.length }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
