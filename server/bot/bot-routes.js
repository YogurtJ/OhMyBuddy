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
    router.post('/bots', route(req => bots.create(req.body)));
    router.get('/bots/:id/settings', route(req => bots.settings(req.params.id)));
    router.patch('/bots/:id', route(req => bots.update(req.params.id, req.body)));
    router.post('/bots/:id/setup', route(req => bots.setup(req.params.id, req.body)));
    router.post('/bots/:id/onboarding', route(req => bots.onboarding(req.params.id, req.body)));
    router.get('/bots/:id/about-sources', route(req => bots.aboutSources(req.params.id)));
    router.post('/bots/:id/about', route(req => bots.about(req.params.id, req.body)));
    router.post('/bots/:id/main-window', route(req => bots.ensureMainWindow(req.params.id)));
    router.get('/bots/:id/windows/:windowId/session', route(req => bots.resolve(req.params.id, req.params.windowId)));
    router.get('/bots/:id/windows/:windowId/generations', route(req => bots.generations(req.params.id, req.params.windowId)));
    router.get('/bots/:id/windows/:windowId/history', route(req => bots.history(req.params.id, req.params.windowId, req.query)));
    // Maintenance entry: rotation normally runs automatically (context engine). Requires the generation the caller saw.
    router.post('/bots/:id/windows/:windowId/rotate', route(req => bots.rotate(req.params.id, req.params.windowId,
        { reason: 'manual', expectedGeneration: req.body?.expectedGeneration })));
}

module.exports = { mountBotRoutes };
