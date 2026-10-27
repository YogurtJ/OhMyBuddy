// Trusted built-in geometry shared by the browser renderer and server validation.
// Persist IDs, never SVG markup. Display names and geometry may evolve independently.
((root, factory) => {
    const catalog = factory();
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    else root.PiAvatarPresets = catalog;
})(globalThis, () => {
    const presets = [
        { id: 'pivane-pebble', name: '小石', asset: 'bot-avatars/pebble.svg',
            path: 'M24 94C24 55 45 28 80 28S136 55 136 94C136 124 115 134 80 134S24 124 24 94Z',
            body: '#293746', eyes: '#faf8f1', darkBody: '#c6d1dd', darkEyes: '#263746' },
        { id: 'pivane-bean', name: '豆豆', asset: 'bot-avatars/bean.svg',
            path: 'M77 23C107 20 130 47 132 79C136 110 115 137 85 136C55 136 32 124 32 104C32 88 43 82 40 66C36 44 53 25 77 23Z',
            body: '#8fb5a0', eyes: '#263b34', darkBody: '#8fb5a0', darkEyes: '#263b34' },
        { id: 'pivane-tile', name: '方方', asset: 'bot-avatars/tile.svg',
            path: 'M54 28H106Q134 28 134 56V106Q134 134 106 134H54Q26 134 26 106V56Q26 28 54 28Z',
            body: '#e7b978', eyes: '#493b31', darkBody: '#e7b978', darkEyes: '#493b31' }
    ].map(Object.freeze);
    const find = id => presets.find(item => item.id === id) || null;
    // Read-time tolerance preserves a removed/missing built-in without rewriting user data.
    const validId = id => typeof id === 'string' && /^pivane-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 80;
    return Object.freeze({ presets: Object.freeze(presets), find, validId });
});
