'use strict';
// Validates new owner selections against the same runtime catalog used by the web picker.
// Retaining a saved unavailable choice must remain possible when a provider is removed.
const fail = message => { throw Object.assign(new Error(message), { status: 409, code: 'BOT_MODEL_UNAVAILABLE' }); };
const modelId = model => model?.id ?? model?.modelId;
const sameModel = (a, b) => a?.provider === b?.provider && modelId(a) === modelId(b);
function effectiveModel(bot, catalog) {
    if (bot.model) return bot.model;
    if (catalog && Object.hasOwn(catalog, 'effectiveDefault')) {
        const model = catalog.effectiveDefault;
        return model ? { provider: model.provider, id: model.modelId ?? model.id } : null;
    }
    return catalog?.defaults?.provider && (catalog.defaults.modelId ?? catalog.defaults.id)
        ? { provider: catalog.defaults.provider, id: catalog.defaults.modelId ?? catalog.defaults.id } : null;
}
async function validateModelChange(previous, next, catalog) {
    const modelChanged = !sameModel(previous.model, next.model);
    const thinkingChanged = previous.thinking !== next.thinking;
    if (!modelChanged && (next.thinking === null || next.thinking === previous.model?.thinking)) return;
    if (!modelChanged && !thinkingChanged || next.model === null && next.thinking === null) return;
    // Following defaults is always allowed. A retained independent preference is kept even if a
    // later workspace default cannot support it; the runtime reports its native effective level.
    if (modelChanged && next.model === null && !thinkingChanged) return;
    let available;
    try { available = await catalog?.(next.workspace); } catch { /* explicit failure below */ }
    const effectiveDefault = await require('./bot-model-runtime').resolveEffectiveDefault(available);
    const desired = effectiveModel(next, { ...available, effectiveDefault });
    const found = desired && available?.models?.find(model => sameModel(model, desired));
    if (!found) fail('This model is not available; keep the current choice or choose another');
    if (next.thinking && !(found.thinkingLevels || []).includes(next.thinking)
        && (modelChanged || thinkingChanged)) fail(`This model does not support thinking level ${next.thinking}; choose a supported level or default`);
}
module.exports = { modelId, sameModel, effectiveModel, validateModelChange };
