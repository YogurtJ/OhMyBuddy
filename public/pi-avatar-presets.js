// Trusted, versioned parts shared by browser rendering and profile validation.
// Version 1 part IDs, outlines and base colors are immutable: add IDs/versions instead of changing what a saved recipe means.
// Anchors (face, limbs, ears, shine) are presentation data and may be tuned without touching saved recipes.
((root, factory) => {
    const catalog = factory();
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    else root.PiAvatarPresets = catalog;
})(globalThis, () => {
    const freeze = value => { for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item); return Object.freeze(value); };
    // face: [x, y, scale] of the eye line. crown: top anchor. ears: [x, y, tilt] on the outline. arms: shoulder pivots.
    // feet: x of each foot (null floats). wide: outline x at the eye line. shine: [x, y, tilt] of the highlight.
    const shapes = [
        { id: 'pebble', name: '石形', path: 'M24 94C24 55 45 28 80 28S136 55 136 94C136 124 115 134 80 134S24 124 24 94Z',
            face: [80, 90, 1], crown: [80, 28], base: 134, squash: 1, ears: [[49, 39, -30], [111, 39, 30]], arms: [[28, 105], [132, 105]], feet: [63, 97], wide: [24, 136], shine: [51, 51, -36] },
        { id: 'bean', name: '豆形', path: 'M77 23C107 20 130 47 132 79C136 110 115 137 85 136C55 136 32 124 32 104C32 88 43 82 40 66C36 44 53 25 77 23Z',
            face: [86, 88, 1], crown: [80, 23], base: 136, squash: 1, ears: [[54, 34, -28], [111, 36, 28]], arms: [[37, 106], [128, 103]], feet: [69, 101], wide: [35, 133], shine: [56, 46, -36] },
        { id: 'tile', name: '圆角方', path: 'M54 28H106Q134 28 134 56V106Q134 134 106 134H54Q26 134 26 106V56Q26 28 54 28Z',
            face: [80, 88, 1], crown: [80, 28], base: 134, squash: .35, ears: [[51, 30, -14], [109, 30, 14]], arms: [[29, 104], [131, 104]], feet: [61, 99], wide: [26, 134], shine: [47, 45, -45] },
        { id: 'drop', name: '水滴', path: 'M80 18C69 42 29 65 29 96C29 123 50 139 80 139C110 139 131 123 131 96C131 65 91 42 80 18Z',
            face: [80, 101, .92], crown: [80, 18], base: 139, squash: .7, ears: [[59, 47, -34], [101, 47, 34]], arms: [[33, 108], [127, 108]], feet: [65, 95], wide: [29, 131], shine: [60, 66, -40] },
        { id: 'puff', name: '柔团', path: 'M24 92C18 80 26 67 39 63C36 45 53 32 69 38C82 22 107 28 113 45C136 46 146 66 136 83C146 106 131 132 108 130C86 144 65 139 55 132C35 135 19 117 24 92Z',
            face: [81, 90, .95], crown: [88, 30], base: 137, squash: 1, ears: [[50, 42, -28], [110, 41, 28]], arms: [[27, 106], [136, 104]], feet: [65, 97], wide: [23, 139], shine: [55, 53, -32] },
        { id: 'capsule', name: '胶囊', path: 'M80 18C106 18 122 37 122 62V99C122 124 106 140 80 140C54 140 38 124 38 99V62C38 37 54 18 80 18Z',
            face: [80, 84, .82], crown: [80, 18], base: 140, squash: .55, ears: [[51, 32, -26], [109, 32, 26]], arms: [[41, 104], [119, 104]], feet: [68, 92], wide: [38, 122], shine: [55, 42, -40] },
        { id: 'egg', name: '蛋形', path: 'M80 22C110 22 132 60 132 96C132 123 110 138 80 138S28 123 28 96C28 60 50 22 80 22Z',
            face: [80, 96, .96], crown: [80, 22], base: 138, squash: .9, ears: [[51, 37, -30], [109, 37, 30]], arms: [[31, 108], [129, 108]], feet: [64, 96], wide: [28, 132], shine: [55, 49, -38] },
        { id: 'ghost', name: '幽灵', path: 'M30 84C30 49 52 24 80 24S130 49 130 84V122Q130 138 114 138Q100 138 97 127Q94 138 80 138Q66 138 63 127Q60 138 46 138Q30 138 30 122Z',
            face: [80, 80, 1], crown: [80, 24], base: 138, squash: .6, ears: [[50, 37, -30], [110, 37, 30]], arms: [[33, 100], [127, 100]], feet: null, wide: [30, 130], shine: [54, 48, -38] },
        { id: 'onigiri', name: '饭团', path: 'M80 24C91 24 99 31 106 44L134 98C144 118 131 136 110 136H50C29 136 16 118 26 98L54 44C61 31 69 24 80 24Z',
            face: [80, 100, .95], crown: [80, 24], base: 136, squash: .6, ears: [[57, 42, -30], [103, 42, 30]], arms: [[27, 113], [133, 113]], feet: [61, 99], wide: [25, 135], shine: [62, 56, -28] },
        { id: 'mochi', name: '麻薯', path: 'M18 104C18 73 44 52 80 52S142 73 142 104C142 127 119 136 80 136S18 127 18 104Z',
            face: [80, 101, 1.04], crown: [80, 52], base: 136, squash: 1.2, ears: [[52, 58, -28], [108, 58, 28]], arms: [[22, 113], [138, 113]], feet: [60, 100], wide: [18, 142], shine: [51, 69, -30] }
    ];
    const channels = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
    const mix = (a, b, amount) => '#' + channels(a).map((value, index) => Math.round(value + (channels(b)[index] - value) * amount).toString(16).padStart(2, '0')).join('');
    // The shaded side leans towards a cool ink instead of plain black, so pastel bodies stay clean.
    const shade = body => mix(body, '#2b2350', .2);
    const palettes = [
        { id: 'graphite', name: '石墨', body: '#465560', eyes: '#faf7ed' },
        { id: 'moss', name: '苔绿', body: '#9dc4aa', eyes: '#263d32' },
        { id: 'apricot', name: '暖杏', body: '#edc485', eyes: '#493929' },
        { id: 'blue', name: '雾蓝', body: '#a1c9e3', eyes: '#244354' },
        { id: 'peach', name: '莓桃', body: '#e5a997', eyes: '#4c342f' },
        { id: 'lilac', name: '浅紫', body: '#c3b4de', eyes: '#40344f' },
        { id: 'oat', name: '燕麦', body: '#dfd5bc', eyes: '#483e30' },
        { id: 'mint', name: '薄荷', body: '#82beb4', eyes: '#213f3a' },
        { id: 'butter', name: '奶黄', body: '#ffd66e', eyes: '#4a3520' },
        { id: 'tangerine', name: '蜜橘', body: '#ffad5c', eyes: '#4d2a14' },
        { id: 'coral', name: '珊瑚', body: '#ff9480', eyes: '#4f2620' },
        { id: 'bubblegum', name: '泡泡粉', body: '#ffa6cb', eyes: '#51213b' },
        { id: 'grape', name: '葡萄紫', body: '#ac96f8', eyes: '#2b2157' },
        { id: 'sky', name: '晴空蓝', body: '#7cc5fb', eyes: '#17364f' },
        { id: 'teal', name: '湖青', body: '#4fc9b6', eyes: '#0f3d38' },
        { id: 'lime', name: '青柠', body: '#b9e272', eyes: '#30441a' },
        { id: 'cocoa', name: '可可', body: '#b98a66', eyes: '#3c2516' },
        { id: 'snow', name: '雪白', body: '#f6f2ea', eyes: '#3b3a45' },
        { id: 'ink', name: '墨夜', body: '#34364a', eyes: '#ffffff' },
        // Preserve the three original presets, including their original dark-theme colors.
        { id: 'legacy-pebble', name: '原版小石', body: '#293746', eyes: '#faf8f1', darkBody: '#c6d1dd', darkEyes: '#263746', legacy: true },
        { id: 'legacy-bean', name: '原版豆豆', body: '#8fb5a0', eyes: '#263b34', legacy: true },
        { id: 'legacy-tile', name: '原版方方', body: '#e7b978', eyes: '#493b31', legacy: true }
    ].map(item => ({ ...item, deep: shade(item.body), darkDeep: shade(item.darkBody || item.body) }));
    const eyes = [{ id: 'dot', name: '圆点眼' }, { id: 'oval', name: '椭圆眼' }, { id: 'capsule', name: '胶囊眼' }, { id: 'display', name: '短屏眼' },
        { id: 'sparkle', name: '闪亮眼' }, { id: 'wide', name: '圆睁眼' }, { id: 'joy', name: '弯弯眼' }, { id: 'sleepy', name: '慵懒眼' }];
    const mouths = [{ id: 'none', name: '无嘴' }, { id: 'smile', name: '小微笑' }, { id: 'grin', name: '咧嘴笑' }, { id: 'open', name: '开心笑' },
        { id: 'cat', name: '猫猫嘴' }, { id: 'tiny', name: '小圆嘴' }];
    const round = ['pebble', 'bean', 'tile', 'puff', 'capsule', 'egg', 'ghost', 'onigiri', 'mochi'];
    const decorations = [{ id: 'none', name: '无装饰' },
        { id: 'sprout', name: '小芽', shapes: ['pebble', 'bean', 'tile', 'puff', 'egg', 'ghost', 'onigiri', 'mochi'] },
        { id: 'antenna', name: '小天线', shapes: ['pebble', 'tile', 'capsule', 'egg', 'ghost', 'mochi'] }, { id: 'blush', name: '腮红' },
        { id: 'cat', name: '猫耳', shapes: round }, { id: 'bear', name: '熊耳', shapes: round }, { id: 'bunny', name: '兔耳', shapes: round },
        { id: 'bow', name: '蝴蝶结', shapes: round }, { id: 'flower', name: '小花', shapes: round }, { id: 'crown', name: '小皇冠', shapes: round },
        { id: 'halo', name: '光环' }, { id: 'headphones', name: '耳机', shapes: round.filter(id => id !== 'onigiri') }, { id: 'glasses', name: '圆眼镜' }];
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
        ['ohmybuddy-peach', '小桃', 'peach', recipe('drop', 'peach', 'oval', 'smile', 'blush')],
        ['ohmybuddy-sunny', '阳阳', 'sunny', recipe('pebble', 'butter', 'sparkle', 'open', 'blush')],
        ['ohmybuddy-mochi', '麻薯', 'mochi', recipe('mochi', 'snow', 'dot', 'cat', 'cat')],
        ['ohmybuddy-kuma', '小熊', 'kuma', recipe('egg', 'cocoa', 'dot', 'smile', 'bear')],
        ['ohmybuddy-bunny', '兔兔', 'bunny', recipe('egg', 'bubblegum', 'oval', 'tiny', 'bunny')],
        ['ohmybuddy-boo', '小幽', 'boo', recipe('ghost', 'grape', 'wide', 'open')],
        ['ohmybuddy-beat', '节拍', 'beat', recipe('tile', 'ink', 'joy', 'smile', 'headphones')],
        ['ohmybuddy-sage', '博士', 'sage', recipe('bean', 'teal', 'dot', 'smile', 'glasses')],
        ['ohmybuddy-coral', '珊珊', 'coral', recipe('puff', 'coral', 'sparkle', 'grin', 'bow')],
        ['ohmybuddy-onigiri', '饭团', 'onigiri', recipe('onigiri', 'snow', 'sleepy', 'smile', 'blush')],
        ['ohmybuddy-angel', '天天', 'angel', recipe('capsule', 'sky', 'joy', 'smile', 'halo')],
        ['ohmybuddy-prince', '王子', 'prince', recipe('mochi', 'tangerine', 'sparkle', 'grin', 'crown')],
        ['ohmybuddy-lime', '青柠', 'lime', recipe('pebble', 'lime', 'wide', 'cat', 'flower')]
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
        return { recipe: value, shape, palette, path: shape.path, body: palette.body, eyes: palette.eyes, deep: palette.deep,
            darkBody: palette.darkBody || palette.body, darkEyes: palette.darkEyes || palette.eyes, darkDeep: palette.darkDeep };
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
            // A face reads better with a mouth, and most looks should keep one accessory or none.
            if (field === 'mouth') options = options.filter(item => item.id !== 'none');
            if (field === 'decoration') options = [...options, ...options.filter(item => item.id === 'none'), ...options.filter(item => item.id === 'none')];
            if (options.length) value[field] = options[hash(`${seed}:${field}`) % options.length].id;
        }
        return knownComposition(value) ? value : original;
    }
    return freeze({ presets, shapes, palettes, eyes, mouths, decorations, fields, groups, part, find, validId,
        validComposition, knownComposition, compatible, toComposition, resolve, same, randomize });
});
