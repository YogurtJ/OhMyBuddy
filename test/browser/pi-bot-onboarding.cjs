// The end of getting acquainted (public/pi-bot-onboarding.js, flow 2): a local explanation of
// how the Bot works and where things are kept, an optional model choice from the settings list
// that is never claimed as saved after a failure or conflict, and first-task chips that send a
// message only when clicked (never over a draft). Finished older Bots are not asked again.
// Synthetic backend (pi-bot-fixture.js); desktop, phone and narrow phone; dark and reduced motion.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { BOT, say, serve, botRecord, botPage, newWorld, layout } = require('./pi-bot-fixture.js');

const MODELS = { defaults: { provider: 'fixture', modelId: 'small', thinkingLevel: 'medium' }, models: [
    { provider: 'fixture', id: 'small', name: 'Small', thinkingLevels: [] },
    { provider: 'fixture', id: 'large', name: 'Large', thinkingLevels: ['low', 'high'] }] };

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
            let model = null, revision = 'r1', fails = ['server', 'conflict'];
            const posts = [];
            const world = newWorld({
                bots: () => [botRecord({ bot: { model, onboarding, permissions: { preset: 'balanced', rules: 0 } } })],
                messages: () => [say('user', '就这些啦', '2026-10-26T06:00:00Z'), say('assistant', '好，我们算是认识了。', '2026-10-26T06:00:05Z')]
            });
            Object.defineProperty(world, 'revision', { get: () => revision });
            const api = ({ pathname, method, body }) => {
                if (pathname === `/api/pi/bots/${BOT}/settings`) return { json: { revision, bot: { id: BOT, name: '小狸', avatar: { kind: 'emoji', value: '🦊' }, soul: '',
                    bot: world.bots()[0].bot }, models: MODELS } };
                if (pathname === `/api/pi/bots/${BOT}/onboarding` && method === 'POST') {
                    posts.push(body);
                    assert.equal(body.expectedRevision, revision);
                    if (body.action === 'model-choice') {
                        const fail = fails.shift();
                        if (fail === 'server') return { status: 500, json: { error: 'Disk full' } };
                        if (fail === 'conflict') { revision = 'r2'; return { status: 409, json: { error: 'Profiles changed' } }; }
                        model = body.model; onboarding = { ...onboarding, steps: { ...onboarding.steps, model: 'done' } };
                    } else if (body.action === 'first-task') {
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
            try {
                // 1. Local and transparent: what is kept where, the way of working, honest scope.
                await closure.waitFor();
                assert.equal(await closure.locator('header strong').textContent(), '认识好啦！先说说我平时怎么做事');
                const facts = await closure.locator('.pi-bot-closure-facts').innerText();
                assert.match(facts, /运行 Pivane 的这台电脑上/);
                assert.match(facts, /“稳妥”/);
                assert.match(facts, /不是系统沙箱/);
                await closure.locator('[data-closure-model]').waitFor();
                assert.equal(await closure.locator('[data-closure-model] option').first().textContent(), '跟随默认（Small）');
                assert.deepEqual(world.prompts, [], 'nothing reaches the model by itself');
                if (phone) assert.equal(await closure.locator('[data-closure-model]').evaluate(node => getComputedStyle(node).fontSize), '16px');
                const box = await closure.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'the panel fits the composer column');
                assert.equal((await layout(page)).overflow, false);
                await shot('bot-closure');

                // 2. While the Bot works the panel steps aside; it comes back once idle.
                world.socket.send(JSON.stringify({ type: 'agent_start' }));
                await page.waitForFunction(() => document.querySelector('.pi-bot-closure').hidden);
                world.socket.send(JSON.stringify({ type: 'agent_end', messages: [] }));
                world.socket.send(JSON.stringify({ type: 'agent_settled' }));
                await closure.waitFor();

                // 3. Model: a failure and a conflict keep the choice and never claim it was saved.
                await closure.locator('[data-closure-model]').selectOption({ label: 'Large' });
                await closure.locator('[data-closure-thinking]').selectOption({ label: '高' });
                await closure.locator('[data-closure-action="model"]').click();
                await closure.locator('.pi-bot-setup-note.is-error').filter({ hasText: '模型没有保存：Disk full' }).waitFor();
                assert.equal(await closure.locator('.pi-bot-closure-saved').count(), 0);
                assert.equal(await closure.locator('[data-closure-model]').evaluate(node => node.selectedOptions[0].textContent), 'Large');
                assert.equal(await closure.locator('[data-closure-thinking]').inputValue(), 'high');
                await closure.locator('[data-closure-action="model"]').click();
                await closure.locator('.pi-bot-setup-note.is-error').filter({ hasText: '你的选择还在' }).waitFor();
                assert.equal(await closure.locator('[data-closure-thinking]').inputValue(), 'high');
                assert.equal(await closure.locator('.pi-bot-closure-saved').count(), 0);
                await shot('bot-closure-model-conflict');
                await closure.locator('[data-closure-action="model"]').click();
                await closure.locator('.pi-bot-closure-saved').filter({ hasText: '用 Large 说话' }).waitFor();
                assert.deepEqual(posts.map(body => [body.action, body.model, body.expectedRevision]), [
                    ['model-choice', { provider: 'fixture', id: 'large', thinking: 'high' }, 'r1'],
                    ['model-choice', { provider: 'fixture', id: 'large', thinking: 'high' }, 'r1'],
                    ['model-choice', { provider: 'fixture', id: 'large', thinking: 'high' }, 'r2']], 'each try is the user\'s click, with the reread revision');

                // 4. A first task is sent only on click and never over a draft.
                await page.locator('#pi-input').fill('我自己的草稿');
                await closure.locator('[data-closure-task="plan"]').click();
                await closure.locator('.pi-bot-setup-note.is-error').filter({ hasText: '草稿' }).waitFor();
                assert.equal(posts.length, 3, 'the step is not recorded while a draft is in the way');
                assert.equal(await page.locator('#pi-input').inputValue(), '我自己的草稿', 'the draft is untouched');
                await page.locator('#pi-input').fill('');
                await shot('bot-closure-tasks');
                await closure.locator('[data-closure-task="plan"]').click();
                await page.waitForFunction(() => document.querySelector('.pi-bot-closure').hidden);
                assert.deepEqual(posts.at(-1), { action: 'first-task', choice: 'plan', expectedRevision: 'r2+' });
                for (let i = 0; i < 50 && !world.prompts.length; i++) await page.waitForTimeout(100);
                assert.deepEqual(world.prompts, ['帮我理一理接下来要做的事，排一个轻松可行的计划。']);
                await page.waitForTimeout(300);
                assert.equal(await page.locator('.pi-bot-closure').isHidden(), true, 'the closure ends once the first task is chosen');

                // 5. "Later" ends gently and sends nothing; "my own" just focuses the composer.
                onboarding = { ...onboarding, steps: { about: 'done', model: 'done' } }; delete onboarding.firstTaskChoice;
                await refresh();
                await closure.waitFor();
                assert.equal(await closure.locator('.pi-bot-closure-saved').count(), 1, 'a settled model step is shown, not asked again');
                await closure.locator('[data-closure-task="later"]').click();
                await page.locator('.pi-toast').filter({ hasText: '随时跟我说' }).waitFor();
                assert.equal(posts.at(-1).choice, 'later');
                assert.equal(world.prompts.length, 1);
                onboarding = { ...onboarding, steps: { about: 'done', model: 'done' } };
                await refresh();
                await closure.waitFor();
                await closure.locator('[data-closure-task="own"]').click();
                await page.waitForFunction(() => document.activeElement?.id === 'pi-input');
                assert.equal(posts.at(-1).choice, 'own');
                assert.equal(world.prompts.length, 1);

                // 6. A Bot that finished an older interview is never re-enrolled.
                onboarding = { version: 1, phase: 'done', firstBot: true, steps: { about: 'done' }, startedAt: null, completedAt: '2026-10-20T00:00:00Z' };
                await refresh();
                await page.waitForTimeout(400);
                assert.equal(await page.locator('.pi-bot-closure').isHidden(), true);

                // 7. Dark theme and reduced motion keep the panel readable and still.
                if (width === 393) {
                    onboarding = { version: 1, flowVersion: 2, phase: 'done', firstBot: true, steps: {}, startedAt: null, completedAt: null };
                    await page.emulateMedia({ reducedMotion: 'reduce' });
                    await page.locator('html').evaluate(node => { node.dataset.theme = 'dark'; });
                    await refresh();
                    await closure.waitFor();
                    assert.equal(await closure.evaluate(node => getComputedStyle(node).animationName), 'none');
                    await shot('bot-closure-dark-reduced');
                }
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ width, status: 'passed', posts: posts.length }));
            } finally { await context.close(); }
        }
    } finally { await browser?.close(); await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
