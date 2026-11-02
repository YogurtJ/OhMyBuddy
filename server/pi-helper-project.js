'use strict';
const { readBot } = require('./bot/bot-settings');
const ID = /^[a-f0-9-]{36}$/;
// Project association does not grant the helper a Buddy identity or its tool policy.
async function helperProject({ store, profiles, profileId, cwd }) {
    if (profileId != null) {
        if (typeof profileId !== 'string' || !ID.test(profileId)) throw new Error('Invalid helper profile');
        const profile = await profiles?.getProfile(profileId);
        if (!profile || profile.trashedAt) throw Object.assign(new Error('Profile not found'), { status: 404 });
        const bot = readBot(profile);
        if (bot) return { cwd: store.resolveProject(bot.workspace), ownerProfileId: profile.id, profile };
        return { cwd: store.resolveProject(cwd === undefined ? store.defaultProject() : cwd), ownerProfileId: null, profile };
    }
    return { cwd: cwd === undefined ? null : store.resolveProject(cwd), ownerProfileId: null, profile: null };
}
module.exports = { helperProject };
