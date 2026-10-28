'use strict';
// SDK imports stay native ESM at this adapter boundary (managed extensions also load through jiti).
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let runtime;
function nativeRuntime() {
    runtime ||= Promise.all([import('@earendil-works/pi-coding-agent'), import('@earendil-works/pi-ai'),
        import(pathToFileURL(path.join(__dirname, '../../node_modules/@earendil-works/pi-coding-agent/dist/core/model-resolver.js')).href)]);
    return runtime;
}
async function automaticModel(models) {
    const [, , { findInitialModel }] = await nativeRuntime();
    return findInitialModel({ scopedModels: [], isContinuing: true, modelRuntime: { getAvailableSnapshot: () => models } });
}

// Catalog entries are the runtime's available models. Preserve saved defaults separately;
// resolving this projection never persists an automatic choice or sends a model request.
async function resolveEffectiveDefault(catalog) {
    if (!Array.isArray(catalog?.models)) return null;
    const models = catalog.models.map(model => ({ ...model, id: model.id ?? model.modelId }));
    const configured = Object.hasOwn(catalog, 'effectiveDefault') ? catalog.effectiveDefault
        : catalog.defaults?.provider && (catalog.defaults.modelId ?? catalog.defaults.id)
            ? { provider: catalog.defaults.provider, modelId: catalog.defaults.modelId ?? catalog.defaults.id } : undefined;
    if (configured !== undefined) {
        const found = configured && models.find(model => model.provider === configured.provider && model.id === (configured.modelId ?? configured.id));
        return found ? { provider: found.provider, modelId: found.id } : null;
    }
    try {
        const { model } = await automaticModel(models);
        return model ? { provider: model.provider, modelId: model.id } : null;
    } catch { return null; }
}

async function resolveRuntimeModel(ctx, desired, thinking, agentDir) {
    const [{ SettingsManager }, { getSupportedThinkingLevels, clampThinkingLevel }] = await nativeRuntime();
    const defaults = SettingsManager.create(ctx.cwd, agentDir, { projectTrusted: false });
    let selection = desired, defaultLevel = defaults.getDefaultThinkingLevel();
    if (!selection) {
        const provider = defaults.getDefaultProvider(), id = defaults.getDefaultModel();
        if (provider && id) selection = { provider, id };
        else {
            const initial = await automaticModel(ctx.modelRegistry?.getAvailable?.() || []);
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
module.exports = { resolveRuntimeModel, resolveEffectiveDefault };
