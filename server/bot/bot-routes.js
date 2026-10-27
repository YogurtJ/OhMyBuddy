'use strict';
// REST surface for Bot Mode. Mounted on the authenticated /api/pi router; every response
// is no-store. Writes require the caller's last seen revision and never retry silently.
function mountBotRoutes(router, { bots }) {
    const route = action => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try { res.json(await action(req)); }
        catch (error) { res.status(error.status || error.statusCode || 400).json({ error: error.message, code: error.code }); }
    };
    router.get('/bots', route(() => bots.list()));
    router.get('/bots/readiness', route(() => bots.readiness()));
    router.post('/bots', route(req => bots.create(req.body)));
    router.get('/bots/:id/settings', route(req => bots.settings(req.params.id)));
    router.patch('/bots/:id', route(req => bots.update(req.params.id, req.body)));
    router.post('/bots/:id/trash', route(req => bots.trash(req.params.id, req.body)));
    router.post('/bots/:id/setup', route(req => bots.setup(req.params.id, req.body)));
    router.post('/bots/:id/onboarding', route(req => bots.onboarding(req.params.id, req.body)));
    router.get('/bots/:id/about-sources', route(req => bots.aboutSources(req.params.id)));
    router.post('/bots/:id/about', route(req => bots.about(req.params.id, req.body)));
    router.post('/bots/:id/windows', route(req => bots.createTopic(req.params.id, req.body)));
    router.patch('/bots/:id/windows/:windowId', route(req => bots.updateWindow(req.params.id, req.params.windowId, req.body)));
    router.post('/bots/:id/main-window', route(req => bots.ensureMainWindow(req.params.id)));
    router.get('/bots/:id/topics/open-items', route(req => bots.topicOpenItems(req.params.id)));
    router.get('/bots/:id/windows/:windowId/session', route(req => bots.resolve(req.params.id, req.params.windowId)));
    router.get('/bots/:id/windows/:windowId/generations', route(req => bots.generations(req.params.id, req.params.windowId)));
    router.get('/bots/:id/windows/:windowId/history', route(req => bots.history(req.params.id, req.params.windowId, req.query)));
    router.get('/bots/:id/windows/:windowId/notebook', route(req => bots.notebook(req.params.id, req.params.windowId)));
    router.post('/bots/:id/windows/:windowId/notebook', route(async req => {
        const result = await bots.editNotebook(req.params.id, req.params.windowId, req.body);
        // A changed due time or a closed commitment changes its follow-up (bot-proactive.js).
        void bots.proactive?.syncNotes(req.params.id, req.params.windowId).catch(() => {});
        return result;
    }));
    // Follow-ups and check-ins this Bot will start itself (M4-3); the user can cancel one.
    router.get('/bots/:id/follow-ups', route(async req => ({ items: bots.proactive ? await bots.proactive.list(req.params.id) : [] })));
    router.delete('/bots/:id/follow-ups/:itemId', route(req => { if (!bots.proactive) throw Object.assign(new Error('Unavailable'), { status: 503 }); return bots.proactive.cancel(req.params.id, req.params.itemId); }));
    // Maintenance entry: rotation normally runs automatically (context engine). Requires the generation the caller saw.
    router.post('/bots/:id/windows/:windowId/rotate', route(req => bots.rotate(req.params.id, req.params.windowId,
        { reason: 'manual', expectedGeneration: req.body?.expectedGeneration })));
}

module.exports = { mountBotRoutes };
