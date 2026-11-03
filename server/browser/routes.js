'use strict';
const { takeHttpOperationCompletion } = require('../pi-maintenance-client');
function mountBrowserRoutes(router, service) {
    const respond = fn => async (req, res) => {
        const complete = takeHttpOperationCompletion(req);
        res.set('Cache-Control', 'no-store');
        try { res.json(await fn(req)); }
        catch (error) {
            const code = /^BROWSER_[A-Z_]+$/.test(error.code || error.message || '') ? error.code || error.message : 'BROWSER_FAILED';
            res.status(error.status || 500).json({ error: code, code });
        } finally { complete(); }
    };
    const empty = req => {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length) throw Object.assign(new Error('BROWSER_INPUT'), { status: 400 });
    };
    router.get('/browser', respond(() => service.status()));
    router.put('/browser', respond(req => service.configure(req.body)));
    router.post('/browser/install', respond(req => { empty(req); return service.install(); }));
    router.post('/browser/close', respond(req => { empty(req); return service.close(); }));
}
module.exports = { mountBrowserRoutes };
