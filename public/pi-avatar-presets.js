// Trusted, versioned parts shared by browser rendering and profile validation.
// Version 1 geometry and palettes are immutable: add IDs/versions instead of changing saved faces.
((root, factory) => {
    const catalog = factory();
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    else root.PiAvatarPresets = catalog;
})(globalThis, () => {
    const freeze = value => { for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item); return Object.freeze(value); };
    const shapes = [
        { id: 'pebble', name: '石形', path: 'M24 94C24 55 45 28 80 28S136 55 136 94C136 124 115 134 80 134S24 124 24 94Z', face: [80, 73, 1], top: 28, squash: 1 },
        { id: 'bean', name: '豆形', path: 'M77 23C107 20 130 47 132 79C136 110 115 137 85 136C55 136 32 124 32 104C32 88 43 82 40 66C36 44 53 25 77 23Z', face: [80, 73, 1], top: 23, squash: 1 },
        { id: 'tile', name: '圆角方', path: 'M54 28H106Q134 28 134 56V106Q134 134 106 134H54Q26 134 26 106V56Q26 28 54 28Z', face: [80, 73, 1], top: 28, squash: .35 },
        { id: 'drop', name: '水滴', path: 'M80 18C69 42 29 65 29 96C29 123 50 139 80 139C110 139 131 123 131 96C131 65 91 42 80 18Z', face: [80, 92, .87], top: 18, squash: .7 },
        { id: 'puff', name: '柔团', path: 'M24 92C18 80 26 67 39 63C36 45 53 32 69 38C82 22 107 28 113 45C136 46 146 66 136 83C146 106 131 132 108 130C86 144 65 139 55 132C35 135 19 117 24 92Z', face: [80, 86, .97], top: 30, squash: 1 },
        { id: 'capsule', name: '胶囊', path: 'M80 18C106 18 122 37 122 62V99C122 124 106 140 80 140C54 140 38 124 38 99V62C38 37 54 18 80 18Z', face: [80, 78, .8], top: 18, squash: .55 }
    ];
    const palettes = [
        { id: 'graphite', name: '石墨', body: '#465560', eyes: '#faf7ed' },
        { id: 'moss', name: '苔绿', body: '#9dc4aa', eyes: '#263d32' },
        { id: 'apricot', name: '暖杏', body: '#edc485', eyes: '#493929' },
        { id: 'blue', name: '雾蓝', body: '#a1c9e3', eyes: '#244354' },
        { id: 'peach', name: '莓桃', body: '#e5a997', eyes: '#4c342f' },
        { id: 'lilac', name: '浅紫', body: '#c3b4de', eyes: '#40344f' },
        { id: 'oat', name: '燕麦', body: '#dfd5bc', eyes: '#483e30' },
        { id: 'mint', name: '薄荷', body: '#82beb4', eyes: '#213f3a' },
        // Preserve the three original presets, including their original dark-theme colors.
        { id: 'legacy-pebble', name: '原版小石', body: '#293746', eyes: '#faf8f1', darkBody: '#c6d1dd', darkEyes: '#263746', legacy: true },
        { id: 'legacy-bean', name: '原版豆豆', body: '#8fb5a0', eyes: '#263b34', legacy: true },
        { id: 'legacy-tile', name: '原版方方', body: '#e7b978', eyes: '#493b31', legacy: true }
    ];
    const eyes = [{ id: 'dot', name: '圆点眼' }, { id: 'oval', name: '椭圆眼' }, { id: 'capsule', name: '胶囊眼' }, { id: 'display', name: '短屏眼' }];
    const mouths = [{ id: 'none', name: '无嘴' }, { id: 'smile', name: '小微笑' }];
    const decorations = [{ id: 'none', name: '无装饰' }, { id: 'sprout', name: '小芽', shapes: ['pebble', 'bean', 'tile', 'puff'] },
        { id: 'antenna', name: '小天线', shapes: ['pebble', 'tile', 'capsule'] }, { id: 'blush', name: '腮红' }];
    const fields = ['shape', 'palette', 'eyes', 'mouth', 'decoration'];
    const groups = { shape: shapes, palette: palettes, eyes, mouth: mouths, decoration: decorations };
    const part = (field, id) => groups[field]?.find(item => item.id === id) || null;
    const recipe = (shape, palette, eye = 'capsule', mouth = 'none', decoration = 'none') =>
        ({ kind: 'composed', version: 1, shape, palette, eyes: eye, mouth, decoration });
    const definitions = [
        ['pivane-pebble', '小石', 'pebble', recipe('pebble', 'legacy-pebble')],
        ['pivane-bean', '豆豆', 'bean', recipe('bean', 'legacy-bean')],
        ['pivane-tile', '方方', 'tile', recipe('tile', 'legacy-tile')],
        ['ohmybuddy-drop', '滴滴', 'drop', recipe('drop', 'blue', 'dot', 'smile')],
        ['ohmybuddy-puff', '团团', 'puff', recipe('puff', 'peach', 'oval')],
        ['ohmybuddy-candy', '软糖', 'candy', recipe('capsule', 'lilac', 'capsule', 'smile')],
        ['ohmybuddy-sprout', '小芽', 'sprout', recipe('pebble', 'moss', 'dot', 'smile', 'sprout')],
        ['ohmybuddy-mint', '薄荷', 'mint', recipe('tile', 'mint', 'dot', 'smile')],
        ['ohmybuddy-oat', '奶团', 'oat', recipe('puff', 'oat', 'dot', 'smile', 'blush')],
        ['ohmybuddy-jelly', '果冻', 'jelly', recipe('bean', 'lilac', 'oval', 'smile')],
        ['ohmybuddy-signal', '信号', 'signal', recipe('tile', 'graphite', 'display', 'none', 'antenna')],
        ['ohmybuddy-peach', '小桃', 'peach', recipe('drop', 'peach', 'oval', 'smile', 'blush')]
    ];
    const presets = definitions.map(([id, name, file, value]) => ({ ...part('palette', value.palette), id, name,
        asset: `bot-avatars/${file}.svg`, recipe: value, path: part('shape', value.shape).path,
        darkBody: part('palette', value.palette).darkBody || part('palette', value.palette).body,
        darkEyes: part('palette', value.palette).darkEyes || part('palette', value.palette).eyes }));
    const find = id => presets.find(item => item.id === id) || null;
    const token = value => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
    const validId = id => typeof id === 'string' && /^(?:pivane|ohmybuddy)-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 80;
    const validComposition = value => value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).length === 7 && Object.keys(value).every(key => ['kind', 'version', ...fields].includes(key))
        && value.kind === 'composed' && Number.isSafeInteger(value.version) && value.version >= 1 && value.version <= 999
        && fields.every(field => token(value[field]));
    const compatible = value => { const item = part('decoration', value.decoration); return Boolean(item) && (!item.shapes || item.shapes.includes(value.shape)); };
    const knownComposition = value => validComposition(value) && value.version === 1 && fields.every(field => part(field, value[field])) && compatible(value);
    const toComposition = avatar => {
        const value = avatar?.kind === 'preset' ? find(avatar.id)?.recipe : avatar;
        return knownComposition(value) ? recipe(value.shape, value.palette, value.eyes, value.mouth, value.decoration) : null;
    };
    const resolve = avatar => {
        const value = toComposition(avatar);
        if (!value) return null;
        const shape = part('shape', value.shape), palette = part('palette', value.palette);
        return { recipe: value, shape, palette, path: shape.path, body: palette.body, eyes: palette.eyes,
            darkBody: palette.darkBody || palette.body, darkEyes: palette.darkEyes || palette.eyes };
    };
    const same = (a, b) => a?.kind === 'composed' && b?.kind === 'composed'
        ? a.version === b.version && fields.every(field => a[field] === b[field]) : JSON.stringify(a) === JSON.stringify(b);
    // Independent field streams: adding a part to one slot never rerolls locked slots.
    const hash = text => { let n = 2166136261; for (const char of text) n = Math.imul(n ^ char.charCodeAt(0), 16777619); return n >>> 0; };
    function randomize(current, locks = [], seed = String(Math.random())) {
        const original = toComposition(current) || { ...presets[0].recipe }, value = { ...original };
        const locked = new Set(locks);
        const allowed = (field, item) => field !== 'decoration' || !item.shapes || item.shapes.includes(value.shape);
        for (const field of fields) {
            if (locked.has(field)) continue;
            let options = groups[field].filter(item => !item.legacy && allowed(field, item));
            if (field === 'shape' && locked.has('decoration')) options = options.filter(item => compatible({ ...value, shape: item.id }));
            if (field === 'decoration') options = [...options, ...options.filter(item => item.id === 'none'), ...options.filter(item => item.id === 'none')];
            if (options.length) value[field] = options[hash(`${seed}:${field}`) % options.length].id;
        }
        return knownComposition(value) ? value : original;
    }
    return freeze({ presets, shapes, palettes, eyes, mouths, decorations, fields, groups, part, find, validId,
        validComposition, knownComposition, compatible, toComposition, resolve, same, randomize });
});
