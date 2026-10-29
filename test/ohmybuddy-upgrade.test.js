const test = require('node:test');
const assert = require('node:assert/strict');
const { MediaProviderCredentials } = require('../server/media-provider-credentials');
const paths = require('../server/bot/bot-guard-paths');

test('OhMyBuddy credential reads preserve Pivane/pi5 identities and new saves use public lifecycle without copying old keys', async () => {
    const stored = new Map([['pivane-media:fixture', 'old-pivane-key'], ['pi5-media:older', 'old-pi5-key']]);
    const calls = [];
    const runtime = {
        registerNativeProvider(provider) { calls.push(['register', provider.id]); },
        async listCredentials() { return [...stored.keys()].map(providerId => ({ type: 'api_key', providerId })); },
        async getAuth(id) { return stored.has(id) ? { auth: { apiKey: stored.get(id) } } : null; },
        async login(id, _method, options) { stored.set(id, await options.prompt()); calls.push(['login', id]); },
        async logout(id) { stored.delete(id); calls.push(['logout', id]); }
    };
    const credentials = new MediaProviderCredentials(); credentials.runtime = async () => runtime;
    assert.equal(await credentials.get('fixture'), 'old-pivane-key');
    assert.equal(await credentials.get('older'), 'old-pi5-key');
    assert.equal(calls.filter(([kind]) => kind === 'login' || kind === 'logout').length, 0, 'reading must not migrate credentials');
    await credentials.save('fixture', 'new-key');
    assert.equal(stored.get('pivane-media:fixture'), 'old-pivane-key', 'old private record is not copied or rewritten');
    assert.equal(await credentials.get('fixture'), 'new-key');
    assert.deepEqual([...await credentials.list()].sort(), ['fixture', 'older']);
    await credentials.remove('fixture');
    assert.equal(await credentials.get('fixture'), '');
    assert.deepEqual(calls.filter(([kind]) => kind === 'logout').map(([, id]) => id), ['ohmybuddy-media:fixture', 'pivane-media:fixture', 'pi5-media:fixture']);
    assert.equal(stored.get('pi5-media:older'), 'old-pi5-key');
});

test('new private runtime, state and credential spellings have the same guard classification as old locations', () => {
    for (const brand of ['ohmybuddy', 'pivane']) {
        assert.equal(paths.credentialName(`${brand}-access.json`), true);
        assert.equal(paths.credentialName(`${brand}-channels/credentials.json`), true);
        assert.equal(paths.privateStateName(`${brand}-profiles/data/profile/USER.md`), true);
        assert.equal(paths.privateStateName(`${brand}-bots/bot/windows.json`), true);
        assert.equal(paths.criticalPath(`/workspace/.${brand}-runtime/state.json`), true);
    }
    assert.equal(paths.criticalPath('/workspace/.ohmybuddy-runtime-other/file'), false);
});
