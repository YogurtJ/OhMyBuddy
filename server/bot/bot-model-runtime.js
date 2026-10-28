'use strict';
// SDK imports stay native ESM at this adapter boundary (managed extensions also load through jiti).
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let runtime;
async function resolveRuntimeModel(ctx, desired, thinking, agentDir) {
    runtime ||= Promise.all([import('@earendil-works/pi-coding-agent'), import('@earendil-works/pi-ai'),
        import(pathToFileURL(path.join(__dirname, '../../node_modules/@earendil-works/pi-coding-agent/dist/core/model-resolver.js')).href)]);
    const [{ SettingsManager }, { getSupportedThinkingLevels, clampThinkingLevel }, { findInitialModel }] = await runtime;
    const defaults = SettingsManager.create(ctx.cwd, agentDir, { projectTrusted: false });
    let selection = desired, defaultLevel = defaults.getDefaultThinkingLevel();
    if (!selection) {
        const provider = defaults.getDefaultProvider(), id = defaults.getDefaultModel();
        if (provider && id) selection = { provider, id };
        else {
            const initial = await findInitialModel({ scopedModels: [], isContinuing: true,
                modelRuntime: { getAvailableSnapshot: () => ctx.modelRegistry?.getAvailable?.() || [] } });
            selection = initial.model;
            defaultLevel = initial.thinkingLevel;
        }
    }
    if (!selection) return null;
    const model = ctx.modelRegistry?.find(selection.provider, selection.id);
    if (!model) return { selection, model: null };
    const requested = thinking ?? defaults.getModelThinkingLevel(selection.provider, selection.id) ?? defaultLevel ?? 'medium';
    return { selection, model, level: clampThinkingLevel(model, requested),
        unsupported: Boolean(thinking && !getSupportedThinkingLevels(model).includes(thinking)) };
}
module.exports = { resolveRuntimeModel };
