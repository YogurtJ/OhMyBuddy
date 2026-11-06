// Shared synthetic backend for full-page Bot browser scripts: public/ served as is, every
// /api/** call and the chat WebSocket answered from an in-memory world. No live identity,
// provider or model call. Scripts override single routes through `api(request)`.
const path = require('node:path');
const express = require('express');

const BOT = '11111111-1111-4111-8111-111111111111', MAIN = '22222222-2222-4222-8222-222222222222';
const BOT2 = '33333333-3333-4333-8333-333333333333', MAIN2 = '44444444-4444-4444-8444-444444444444';
const WORKSPACE = '/fixture/OhMyBuddyBots/bot-11111111';
const APPROVAL = '允许这一步吗？ / Allow this step?';
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const say = (role, text, at) => role === 'user' ? { role, content: text, timestamp: Date.parse(at) }
    : { role, content: [{ type: 'text', text }], model: 'fixture-model', provider: 'fixture', api: 'openai-completions', stopReason: 'stop', usage, timestamp: Date.parse(at) };

async function serve() {
    const app = express(); app.use(express.static(path.join(__dirname, '../../public')));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    return { base: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => server.close(resolve)) };
}

const windowRecord = (id, extra = {}) => ({ id, kind: 'main', title: '主聊天', emoji: '💬', focus: '', createdAt: '2026-10-24T00:00:00Z',
    updatedAt: '2026-10-24T00:00:00Z', archivedAt: null, generation: 0, sessionId: `session-${id.slice(0, 8)}`, generations: 1, ...extra });

// A Bot as GET /bots lists it; `bot` overrides the bot section.
function botRecord({ id = BOT, name = '小狸', avatar = { kind: 'emoji', value: '🦊' }, bot = {}, windows = [windowRecord(MAIN)], windowsRevision = 'w1' } = {}) {
    return { id, name, description: '', avatar, enabled: true, profileRevision: 'p', chosen: { name: true, avatar: true },
        bot: { version: 1, enabled: true, order: 0, job: '帮我安排生活', model: null, thinking: null, permissions: { preset: 'free', rules: 0 },
            notify: { quietHours: { start: '23:00', end: '08:00' }, dailyProactiveLimit: 20 },
            onboarding: { version: 1, phase: 'done', firstBot: true, steps: {}, startedAt: null, completedAt: '2026-10-24T00:10:00Z' },
            createdAt: '2026-10-24T00:00:00Z', ...bot },
        windowsRevision, windows };
}

// world: { revision, bots: () => [...], messages(sessionId) => [...], prompts: [], responses: [], requests: [], socket }
// api(request): an optional override; return a Playwright fulfill options object to answer.
async function botPage(browser, base, world, { width, height = 860, reducedMotion = 'no-preference', api = () => undefined, hash = '#/bot', mobile = false, locale = 'zh-CN', language } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, locale, timezoneId: 'Asia/Shanghai', reducedMotion, isMobile: mobile, hasTouch: mobile });
    if (language) await context.addInitScript(value => localStorage.setItem('pi.workspace.language', value), language);
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url()), pathname = url.pathname, method = route.request().method();
        let body = null;
        try { body = route.request().postData() ? JSON.parse(route.request().postData()) : null; } catch {}
        const request = { url, pathname, method, body };
        world.requests.push({ method, pathname, body });
        const custom = await api(request);
        if (custom !== undefined) return route.fulfill(custom);
        if (pathname === '/api/pi/status') return route.fulfill({ json: { ok: true, bots: true, agentProfiles: true, deliverables: true, sessionWorkflows: true,
            projectRoots: ['/fixture'], defaultProject: '/fixture/project' } });
        if (pathname === '/api/pi/bots/readiness') return route.fulfill({ json: { models: 2 } });
        if (pathname === '/api/pi/bots' && method === 'GET') return route.fulfill({ json: { version: 1, revision: world.revision, bots: world.bots() } });
        const activity = /^\/api\/pi\/bots\/([^/]+)\/activity$/.exec(pathname);
        if (activity) return route.fulfill({ json: { version: 1, profileId: activity[1], generatedAt: Date.now(),
            sources: { proactive: 'available', scheduler: 'available', channels: 'available' },
            limits: { items: 30, schedulerRuns: 100, channelJobs: 60, jobs: 100, generationsPerWindow: 100 }, truncated: false, items: [],
            quota: { proactivePushes: null, scheduledTasks: null } } });
        const session = /^\/api\/pi\/bots\/([^/]+)\/windows\/([^/]+)\/session$/.exec(pathname);
        if (session) {
            const window = world.bots().find(item => item.id === session[1])?.windows.find(item => item.id === session[2]);
            if (!window) return route.fulfill({ status: 404, json: { error: 'Window not found' } });
            // As bot-service resolve(): an archived topic is never opened as a live chat.
            if (window.trashedAt) return route.fulfill({ status: 409, json: { error: 'Restore this topic from trash first', code: 'BOT_TOPIC_TRASHED' } });
            if (window.archivedAt) return route.fulfill({ status: 409, json: { error: 'This topic is archived; restore it before sending', code: 'BOT_WINDOW_ARCHIVED' } });
            return route.fulfill({ json: { window, session: { id: window.sessionId, cwd: WORKSPACE, path: `${WORKSPACE}/${window.sessionId}.jsonl`, name: '', firstMessage: '',
                messageCount: world.messages(window.sessionId).length, agentProfile: { id: session[1], name: '小狸' },
                created: '2026-10-24T00:00:00Z', modified: '2026-10-24T00:00:00Z' } } });
        }
        if (/\/windows\/[^/]+\/generations$/.test(pathname)) return route.fulfill({ json: { generations: [{ generation: 0, startedAt: '2026-10-24T00:00:00Z', endedAt: null, current: true }] } });
        if (pathname === '/api/pi/projects') return route.fulfill({ json: { projects: [], roots: ['/fixture'] } });
        if (pathname.endsWith('/workflow')) return route.fulfill({ json: { leafId: null, lastUserId: null, versions: [], prompts: [], replies: [] } });
        if (pathname.endsWith('/deferred')) return route.fulfill({ json: { jobs: [] } });
        if (pathname === '/api/pi/sessions') return route.fulfill({ json: { sessions: [] } });
        if (pathname === '/api/pi/activity') return route.fulfill({ json: { runtimes: [], pinnedProjects: [], hiddenProjects: [], replyNotices: [] } });
        if (pathname === '/api/pi/profiles') return route.fulfill({ json: { version: 1, revision: 'p', profiles: [] } });
        return route.fulfill({ json: pathname.startsWith('/api/pi/') ? {} : [] });
    });
    await page.routeWebSocket('**/api/pi/ws', ws => {
        world.socket = ws;
        ws.onMessage(raw => {
            const command = JSON.parse(raw);
            if (command.type === 'extension_ui_response') { world.responses.push(command); return; }
            const state = { model: { provider: 'fixture', id: 'fixture-model', name: 'Fixture' }, isStreaming: false, thinkingLevel: 'off' };
            let data = {};
            if (command.type === 'open_session') {
                world.opened.push(command.sessionId);
                data = { session: { id: command.sessionId, cwd: WORKSPACE, path: `${WORKSPACE}/${command.sessionId}.jsonl` }, state,
                    messages: { messages: world.messages(command.sessionId) }, stats: {}, models: { models: [state.model] },
                    thinkingLevels: { levels: ['off'] }, commands: { commands: [] } };
            } else if (command.type === 'get_state') data = state;
            // The stored conversation of the session this socket opened, as after a re-sync.
            else if (command.type === 'get_messages') data = { messages: world.messages(world.opened.at(-1)) };
            if (command.type === 'prompt') world.prompts.push(command.message);
            ws.send(JSON.stringify({ type: 'response', id: command.id, command: command.type, success: true, data }));
        });
    });
    await page.goto(base + hash, { waitUntil: 'domcontentloaded' });
    return { context, page, errors };
}

function newWorld(overrides = {}) {
    return { revision: 'r1', prompts: [], responses: [], requests: [], opened: [], socket: null, messages: () => [], ...overrides };
}

// Layout facts every Bot UI check repeats: no page-level horizontal overflow, and the width
// of the composer-docked panels.
const layout = page => page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth, width: innerWidth }));

// The phone's bottom bar after two painted frames: whether the bar is what sits near the bottom
// edge, and whether its active tab is laid out and on top where it is drawn.
const bottomBar = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
    const under = document.elementFromPoint(innerWidth / 2, innerHeight - 30);
    const active = document.querySelector('#workspace-sidebar .nav-btn.active');
    const box = active?.getBoundingClientRect();
    const visible = Boolean(box && box.width && box.height && box.top >= 0 && box.bottom <= innerHeight && getComputedStyle(active).visibility !== 'hidden'
        && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('.nav-btn') === active);
    resolve({ bar: Boolean(under?.closest('#workspace-sidebar')), active: visible, tab: active?.dataset.tab || null });
}))));

// An evidence screenshot after a theme or motion change. Headless Chromium's first capture after
// such a change can leave the bottom bar's blurred layer unpainted even though the bar is laid out
// and on top (bottomBar); a throwaway capture first lets the saved image show the settled page.
async function settledShot(page, file) {
    await page.screenshot();
    await page.waitForTimeout(250);
    await page.screenshot({ path: file });
}

// Section navigation is shared by the full-page and hand-mounted settings fixtures. Phones
// return to the overview first; :visible chooses the profile hero or the desktop row.
async function settingsPage(sheet, id) {
    await sheet.locator('.pi-bot-sheet-nav').waitFor({ state: 'attached' });
    const back = sheet.locator('.pi-bot-sheet-back');
    if (await back.isVisible()) await back.click();
    await sheet.locator(`[data-nav="${id}"]:visible`).click();
    await sheet.locator(`.pi-bot-sheet-page[data-page="${id}"]`).waitFor();
}

module.exports = { BOT, MAIN, BOT2, MAIN2, APPROVAL, say, serve, botRecord, windowRecord, botPage, newWorld, layout, bottomBar, settledShot, settingsPage };
