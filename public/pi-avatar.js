// Only catalog-owned geometry enters SVG. User recipes contain versioned part IDs, never markup.
(() => {
    const ns = 'http://www.w3.org/2000/svg';
    const t = (text, ...args) => globalThis.PiI18n?.t?.(text, ...args) || text;
    const catalog = () => globalThis.PiAvatarPresets;
    const readMotion = () => { try { return localStorage.getItem('ohmybuddy-avatar-motion') !== 'off'; } catch { return true; } };
    const syncMotion = () => { document.documentElement.dataset.avatarMotion = readMotion() ? 'on' : 'off'; };
    syncMotion();
    window.addEventListener('storage', event => { if (event.key === 'ohmybuddy-avatar-motion' || event.key === null) syncMotion(); });
    const svgNode = (name, attrs = {}, children = []) => {
        const node = document.createElementNS(ns, name);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        node.append(...children);
        return node;
    };
    const group = (cls, attrs = {}, children = []) => svgNode('g', { class: cls, ...attrs }, children);
    const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
    const icon = name => { const node = el('i', `fa-solid ${name}`); node.setAttribute('aria-hidden', 'true'); return node; };
    const button = (label, cls = 'pi-avatar-control', glyph) => {
        const node = el('button', cls); node.type = 'button';
        if (glyph) node.append(icon(glyph));
        if (label) node.append(el('span', '', label));
        return node;
    };
    const dark = hex => { const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)); return r * .299 + g * .587 + b * .114 < 150; };
    let serial = 0;

    // One eye is a group so blinking squashes the iris and its highlights together.
    function eye(kind, cx) {
        const iris = (name, attrs) => svgNode(name, { class: 'avatar-iris', ...attrs });
        const glint = (x, y, r) => svgNode('circle', { class: 'avatar-glint', cx: cx + x, cy: y, r });
        const parts = kind === 'dot' ? [iris('circle', { cx, cy: 0, r: 6.4 }), glint(-2.1, -2.3, 2)]
            : kind === 'oval' ? [iris('ellipse', { cx, cy: 0, rx: 6.2, ry: 8.8 }), glint(-1.9, -3.6, 2.3)]
            : kind === 'display' ? [iris('rect', { x: cx - 7.5, y: -4.2, width: 15, height: 8.4, rx: 3.2 })]
            : kind === 'sparkle' ? [iris('circle', { cx, cy: 0, r: 8.8 }), glint(-2.8, -3.2, 3.1), glint(3.2, 3.4, 1.5)]
            : kind === 'wide' ? [svgNode('circle', { class: 'avatar-sclera', cx, cy: 0, r: 9.2 }), svgNode('circle', { class: 'avatar-pupil', cx: cx + .3, cy: .7, r: 5.7 }), glint(-1.7, -1.8, 2)]
            : kind === 'joy' ? [svgNode('path', { class: 'avatar-line', d: `M${cx - 7.5} 3Q${cx} -9.5 ${cx + 7.5} 3` })]
            : kind === 'sleepy' ? [iris('path', { d: `M${cx - 7.07} -2.5H${cx + 7.07}A7.5 7.5 0 1 1 ${cx - 7.07} -2.5Z` }), glint(-2.2, 1.4, 1.7)]
            : [iris('rect', { x: cx - 4.2, y: -10, width: 8.4, height: 20, rx: 4.2 })];
        return group('avatar-eye', {}, parts);
    }
    function mouth(kind, cls = 'avatar-mouth') {
        if (kind === 'smile') return svgNode('path', { class: `${cls} avatar-line is-mouth`, d: 'M-5 11Q0 16.5 5 11' });
        if (kind === 'grin') return svgNode('path', { class: `${cls} avatar-line is-mouth`, d: 'M-9 10Q0 20 9 10' });
        if (kind === 'cat') return svgNode('path', { class: `${cls} avatar-line is-mouth`, d: 'M-8.5 11Q-4.2 16.5 0 11.5Q4.2 16.5 8.5 11' });
        if (kind === 'tiny') return svgNode('ellipse', { class: `${cls} avatar-iris`, cx: 0, cy: 13.6, rx: 2.9, ry: 3.3 });
        if (kind === 'frown') return svgNode('path', { class: `${cls} avatar-line is-mouth`, d: 'M-5.5 16.5Q0 11 5.5 16.5' });
        if (kind === 'open') return group(cls, {}, [svgNode('path', { class: 'avatar-iris', d: 'M-7.6 10H7.6Q7.6 20.6 0 20.6Q-7.6 20.6-7.6 10Z' }),
            svgNode('ellipse', { class: 'avatar-tongue', cx: 0, cy: 18, rx: 4, ry: 2.3 })]);
        return null;
    }
    function ears(kind, shape) {
        return shape.ears.map(([x, y, tilt]) => {
            const parts = kind === 'cat' ? [svgNode('path', { class: 'avatar-ear', d: 'M-15 12C-15-4-7-19 0-23C7-19 15-4 15 12Z' }), svgNode('path', { class: 'avatar-ear-inner', d: 'M-7.5 9C-7.5-2-3.5-11 0-14C3.5-11 7.5-2 7.5 9Z' })]
                : kind === 'bear' ? [svgNode('circle', { class: 'avatar-ear', cx: 0, cy: -6, r: 13.5 }), svgNode('circle', { class: 'avatar-ear-shade', cx: 0, cy: -5, r: 6.8 })]
                : [svgNode('ellipse', { class: 'avatar-ear', cx: 0, cy: -23, rx: 9.5, ry: 27 }), svgNode('ellipse', { class: 'avatar-ear-inner', cx: 0, cy: -23, rx: 4.6, ry: 19 })];
            return group(`avatar-decoration is-${kind}`, { transform: `translate(${x} ${y}) rotate(${kind === 'bunny' ? tilt * .42 : tilt})` }, parts);
        });
    }
    const STAR = 'M0-10Q1.6-1.6 10 0Q1.6 1.6 0 10Q-1.6 1.6-10 0Q-1.6-1.6 0-10Z';
    function vector(avatar, options = {}) {
        const design = catalog()?.resolve(avatar);
        if (!design) return null;
        const { recipe, shape } = design, [fx, fy, fs] = shape.face, [left, right] = shape.wide, [crownX, crownY] = shape.crown;
        const id = `pi-avatar-${++serial}`, middle = (left + right) / 2, decoration = recipe.decoration;
        const crop = options.focus === 'face' ? `${fx - 31 * fs} ${fy - 23 * fs} ${62 * fs} ${62 * fs}` : '0 0 160 160';
        const svg = svgNode('svg', { viewBox: crop, 'aria-hidden': 'true', class: `pi-preset-svg${options.focus ? ' is-cropped' : ''}` });
        if (avatar.kind === 'preset') svg.dataset.preset = avatar.id;
        else svg.dataset.composed = String(recipe.version);
        svg.dataset.shape = shape.id;
        const pupil = (eyes, body) => dark(eyes) ? eyes : body;
        for (const [key, value] of Object.entries({ body: design.body, deep: design.deep, eyes: design.eyes, pupil: pupil(design.eyes, design.body),
            'dark-body': design.darkBody, 'dark-deep': design.darkDeep, 'dark-eyes': design.darkEyes, 'dark-pupil': pupil(design.darkEyes, design.darkBody) }))
            svg.style.setProperty(`--avatar-${key}`, value);
        svg.style.setProperty('--avatar-breathe-x', String(1 + .016 * shape.squash));
        svg.style.setProperty('--avatar-breathe-y', String(1 - .02 * shape.squash));
        svg.style.setProperty('--avatar-base', `${shape.base}px`);
        const floating = !shape.feet;
        if (floating) svg.dataset.floating = '';
        svg.append(svgNode('ellipse', { class: 'avatar-shadow', cx: middle, cy: shape.base + (floating ? 9 : 6), rx: (right - left) * (floating ? .3 : .37), ry: floating ? 4 : 5.4 }));
        const back = group('avatar-back'), front = group('avatar-front');
        if (['cat', 'bear', 'bunny'].includes(decoration)) back.append(...ears(decoration, shape));
        if (decoration === 'headphones') back.append(svgNode('path', { class: 'avatar-band',
            d: `M${left + 1} ${fy - 6}C${left - 3} ${crownY - 22} ${right + 3} ${crownY - 22} ${right - 1} ${fy - 6}` }));
        shape.arms.forEach(([x, y], index) => {
            const side = index ? 1 : -1;
            const arm = group(`avatar-arm ${index ? 'is-right' : 'is-left'}`, {}, [svgNode('ellipse', { cx: x, cy: y + 8.5, rx: 6.6, ry: 11.6, transform: `rotate(${side * -32} ${x} ${y})` })]);
            arm.style.transformOrigin = `${x}px ${y}px`; arm.style.setProperty('--side', String(side)); back.append(arm);
        });
        for (const x of shape.feet || []) back.append(svgNode('ellipse', { class: 'avatar-foot', cx: x, cy: shape.base - 1, rx: 10.8, ry: 6.6 }));
        // Cel shading: a darker inner band on the lower right, a thin light band on the upper left, clipped to the outline.
        const clip = svgNode('clipPath', { id }, [svgNode('path', { d: design.path })]);
        const [shineX, shineY, shineTilt] = shape.shine;
        const body = group('avatar-skin', { 'clip-path': `url(#${id})` }, [svgNode('path', { class: 'avatar-body', d: design.path }),
            svgNode('path', { class: 'avatar-shade', d: design.path, transform: 'translate(-3.5 -5)' }),
            svgNode('path', { class: 'avatar-light', d: design.path, transform: 'translate(1.6 2.2)' }),
            group('avatar-shine', { transform: `translate(${shineX} ${shineY}) rotate(${shineTilt})` }, [svgNode('ellipse', { cx: 0, cy: 0, rx: 9.5, ry: 5 }), svgNode('circle', { cx: -15, cy: 2.5, r: 2.6 })])]);
        const rim = svgNode('path', { class: 'avatar-rim', d: design.path });
        const face = group('avatar-face', { transform: `translate(${fx} ${fy}) scale(${fs})` });
        const look = group('avatar-look'), normal = group('avatar-normal', {}, [eye(recipe.eyes, -16), eye(recipe.eyes, 16)]);
        look.append(normal);
        for (const [name, d] of [['happy', 'M-23.5 3Q-16-9.5-8.5 3M8.5 3Q16-9.5 23.5 3'], ['closed', 'M-23.5 0Q-16 7.5-8.5 0M8.5 0Q16 7.5 23.5 0'], ['sad', 'M-22.5-6L-11 0L-22.5 6M22.5-6L11 0L22.5 6']])
            look.append(svgNode('path', { class: `avatar-${name} avatar-line`, d }));
        for (const cx of [-27.5, 27.5]) look.append(svgNode('ellipse', { class: `avatar-blush${decoration === 'blush' ? ' is-on' : ''}`, cx, cy: 10, rx: 6.8, ry: 4.2 }));
        if (recipe.mouth !== 'none') look.append(mouth(recipe.mouth), mouth('open', 'avatar-mouth-open'), mouth('frown', 'avatar-mouth-frown'), mouth('tiny', 'avatar-mouth-o'));
        if (decoration === 'glasses') look.append(group('avatar-glasses', {}, [svgNode('circle', { cx: -16, cy: 0, r: 12.6 }), svgNode('circle', { cx: 16, cy: 0, r: 12.6 }),
            svgNode('path', { d: 'M-3.6-1.5Q0-4.5 3.6-1.5M-28.4-2.5L-35-5.5M28.4-2.5L35-5.5' })]));
        face.append(group('avatar-gaze', {}, [look]));
        if (decoration === 'sprout') front.append(group('avatar-decoration is-sprout', { transform: `translate(${crownX} ${crownY})` }, [svgNode('path', { class: 'avatar-stem', d: 'M0 4V-9' }),
            svgNode('path', { class: 'avatar-leaf', d: 'M0-6C-4-16-15-17-19-13C-15-6-6-3 0-6Z' }), svgNode('path', { class: 'avatar-leaf is-far', d: 'M0-8C3-19 14-22 19-19C16-11 8-6 0-8Z' })]));
        else if (decoration === 'antenna') front.append(group('avatar-decoration is-antenna', { transform: `translate(${crownX} ${crownY})` }, [svgNode('path', { class: 'avatar-antenna', d: 'M0 5V-14' }),
            svgNode('circle', { class: 'avatar-antenna-tip', cx: 0, cy: -19, r: 6.4 }), svgNode('circle', { class: 'avatar-antenna-glint', cx: -2, cy: -21.2, r: 1.9 })]));
        else if (decoration === 'crown') front.append(group('avatar-decoration is-crown', { transform: `translate(${crownX} ${crownY + 8}) scale(1.15)` }, [svgNode('path', { class: 'avatar-gold', d: 'M-17 2L-19.5-13L-9.5-5.5L0-17L9.5-5.5L19.5-13L17 2Z' }),
            svgNode('circle', { class: 'avatar-gem', cx: 0, cy: -4.5, r: 2.5 }), svgNode('circle', { class: 'avatar-gem is-cool', cx: -10.5, cy: -2.5, r: 1.7 }), svgNode('circle', { class: 'avatar-gem is-cool', cx: 10.5, cy: -2.5, r: 1.7 })]));
        else if (decoration === 'halo') front.append(group('avatar-decoration is-halo', {}, [svgNode('ellipse', { class: 'avatar-halo', cx: crownX, cy: crownY - 12, rx: 21, ry: 6 })]));
        else if (decoration === 'bow') { const [x, y, tilt] = shape.ears[1]; front.append(group('avatar-decoration is-bow', { transform: `translate(${x - 4} ${y + 6}) rotate(${tilt * .7}) scale(1.25)` }, [
            svgNode('path', { class: 'avatar-ribbon', d: 'M0 0C-6-11-18-12-19.5-3C-19.5 5-8 6.5 0 0ZM0 0C6-11 18-12 19.5-3C19.5 5 8 6.5 0 0Z' }), svgNode('circle', { class: 'avatar-ribbon-knot', cx: 0, cy: 0, r: 4.8 })])); }
        else if (decoration === 'flower') { const [x, y] = shape.ears[0]; front.append(group('avatar-decoration is-flower', { transform: `translate(${x + 3} ${y + 6})` }, [
            ...[0, 72, 144, 216, 288].map(angle => svgNode('circle', { class: 'avatar-petal', cx: 0, cy: -7.4, r: 6, transform: `rotate(${angle})` })), svgNode('circle', { class: 'avatar-pollen', cx: 0, cy: 0, r: 4.4 })])); }
        else if (decoration === 'headphones') for (const [x, side] of [[left, -1], [right, 1]]) front.append(group('avatar-decoration is-headphones', {}, [
            svgNode('rect', { class: 'avatar-cup', x: x - 7 + side * 1, y: fy - 16, width: 14, height: 30, rx: 7 }), svgNode('rect', { class: 'avatar-cup-accent', x: x - 2.5 + side * 3.2, y: fy - 9, width: 5, height: 16, rx: 2.5 })]));
        const breath = group('avatar-breath', {}, [back, clip, body, rim, face, front]);
        svg.append(group('avatar-poke', {}, [group('avatar-motion', {}, [breath])]));
        if (options.bare) return svg;
        // Decorative only; accessible actions and status text live outside this aria-hidden SVG.
        const tx = Math.min(136, right - 4), ty = Math.max(24, crownY + 10);
        const effects = group('avatar-fx');
        effects.append(group('fx-think', {}, [[-13, 3, 3.1], [-4, -6, 4.4], [8, -15, 5.8]].map(([x, y, r]) => svgNode('circle', { cx: tx + x, cy: ty + y, r }))),
            group('fx-zzz', {}, [[-12, 0, 6.5], [-1, -11, 8.5], [12, -24, 11]].map(([x, y, s]) => svgNode('path', { d: `M${tx + x} ${ty + y}h${s}l${-s} ${s}h${s}` }))),
            group('fx-spark', {}, [[left + 2, crownY + 20, .85, ''], [tx + 3, ty - 6, 1.15, ' is-warm'], [tx + 9, ty + 30, .65, '']].map(([x, y, s, cls]) =>
                svgNode('g', { transform: `translate(${x} ${y}) scale(${s})` }, [svgNode('path', { class: `fx-star${cls}`, d: STAR })]))),
            // Positioning attributes stay on wrappers: an animated CSS transform replaces an element's own transform attribute.
            group('fx-sweat', { transform: `translate(${160 - shineX + 2} ${shineY + 2})` }, [group('fx-drop', {}, [svgNode('path', { d: 'M0-8C4.5-1.5 5.6 1.5 5.6 3.8A5.6 5.6 0 0 1-5.6 3.8C-5.6 1.5-4.5-1.5 0-8Z' }), svgNode('circle', { cx: -1.8, cy: 3, r: 1.5 })])]),
            group('fx-wave', { transform: `translate(${right + 3} ${shape.arms[1][1] - 26})` }, [svgNode('path', { d: 'M0 0Q5.5-4.5 4-11M7.5 4Q15.5-3 13-13.5' })]));
        for (const [state, mark, dot] of [['waiting', 'M-4.6-3.6C-4.6-10 4.6-10 4.6-3.6C4.6-.4 0-.6 0 3', 7.6], ['failed', 'M0-7.5V1.2', 6.8]]) {
            effects.append(group(`avatar-badge is-${state}`, { transform: `translate(${tx} ${ty})` }, [group('avatar-badge-body', {}, [svgNode('circle', { class: 'avatar-badge-ring', cx: 0, cy: 0, r: 15 }),
                svgNode('path', { class: 'avatar-badge-disc', d: state === 'waiting' ? 'M-10.6 10.6A15 15 0 1 1-4 14.5L-17 20Z' : 'M0-14A14 14 0 1 1 0 14A14 14 0 1 1 0-14Z' }),
                svgNode('path', { class: 'avatar-badge-mark', d: mark }), svgNode('circle', { class: 'avatar-badge-dot', cx: 0, cy: dot, r: 1.8 })])]));
        }
        svg.append(effects);
        return svg;
    }
    const DEFAULT_PRESET_ID = 'pivane-pebble';
    function fallbackPreset(node) {
        const svg = vector({ kind: 'preset', id: DEFAULT_PRESET_ID });
        if (svg) { node.classList.add('is-preset'); node.append(svg); }
    }
    function render(profile, className = '', options) {
        const node = el('span', className); node.setAttribute('aria-hidden', 'true');
        const avatar = profile?.avatar;
        if (avatar?.kind === 'preset' || avatar?.kind === 'composed') {
            const svg = vector(avatar, options);
            if (svg) { node.classList.add('is-preset'); node.append(svg); }
            else { node.dataset[avatar.kind === 'preset' ? 'missingPreset' : 'missingComposition'] = ''; fallbackPreset(node); }
        } else if (avatar?.kind === 'image' && profile?.id && /^[a-f0-9]{64}$/.test(avatar.version || '')) {
            const img = document.createElement('img'); img.alt = ''; img.decoding = 'async';
            img.src = `/api/pi/profiles/${encodeURIComponent(profile.id)}/avatar?version=${encodeURIComponent(avatar.version)}`;
            img.addEventListener('error', () => { img.remove(); fallbackPreset(node); }, { once: true }); node.append(img);
        } else if (avatar?.kind === 'emoji' && avatar.value) node.textContent = avatar.value;
        else fallbackPreset(node);
        return node;
    }

    // Live faces follow the pointer with their eyes and bounce when pressed. Static copies stay untouched.
    const still = () => document.documentElement.dataset.avatarMotion === 'off' || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const liveFaces = () => document.querySelectorAll('[data-avatar-live="true"] > .pi-preset-svg');
    let frame = 0, pointer = null;
    function follow() {
        frame = 0;
        for (const svg of liveFaces()) {
            const box = svg.getBoundingClientRect();
            if (!pointer || !box.width || still()) { svg.style.removeProperty('--avatar-look-x'); svg.style.removeProperty('--avatar-look-y'); continue; }
            const dx = pointer.x - (box.left + box.width / 2), dy = pointer.y - (box.top + box.height * .56), distance = Math.hypot(dx, dy) || 1;
            const reach = Math.min(1, distance / (box.width * 1.6)) * 3.4;
            svg.style.setProperty('--avatar-look-x', `${(dx / distance * reach).toFixed(2)}px`);
            svg.style.setProperty('--avatar-look-y', `${(dy / distance * reach * .8).toFixed(2)}px`);
        }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(follow); };
    document.addEventListener('pointermove', event => { if (event.pointerType === 'touch') return; pointer = { x: event.clientX, y: event.clientY }; schedule(); }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { pointer = null; schedule(); });
    function poke(svg) {
        if (!svg || still()) return;
        svg.classList.remove('is-poked'); void svg.getBoundingClientRect(); svg.classList.add('is-poked');
        clearTimeout(svg.pokeTimer); svg.pokeTimer = setTimeout(() => svg.classList.remove('is-poked'), 700);
    }
    document.addEventListener('pointerdown', event => {
        const face = event.target instanceof Element && event.target.closest('[data-avatar-live="true"], .pi-avatar-stage');
        if (face) poke(face.querySelector('.pi-preset-svg'));
    }, { passive: true });

    // A face that welcomes someone waves once, then settles into its live idle pose.
    function greet(node, duration = 2800) {
        if (!node?.querySelector?.('.pi-preset-svg')) return node;
        node.dataset.avatarState = 'greeting'; node.dataset.avatarLive = 'true';
        setTimeout(() => { if (node.dataset.avatarState === 'greeting') node.dataset.avatarState = 'idle'; }, duration);
        return node;
    }
    function choices(selected, onSelect) {
        const list = el('div', 'pi-avatar-presets');
        list.setAttribute('role', 'group'); list.setAttribute('aria-label', t('预设形象'));
        for (const design of catalog()?.presets || []) {
            const item = button('', 'pi-avatar-preset');
            item.dataset.avatarPreset = design.id; item.setAttribute('aria-pressed', String(selected?.kind === 'preset' && selected.id === design.id));
            const face = render({ avatar: { kind: 'preset', id: design.id } }, 'pi-bot-face is-lg');
            item.style.setProperty('--avatar-tint', design.body);
            item.append(face, el('span', '', t(design.name)));
            // The hovered or focused card says hello; every other card stays a static picture.
            const greet = on => { face.dataset.avatarState = on ? 'greeting' : 'idle'; face.dataset.avatarLive = String(on); };
            for (const [type, on] of [['pointerenter', true], ['pointerleave', false], ['focus', true], ['blur', false]]) item.addEventListener(type, () => greet(on));
            item.addEventListener('click', () => {
                for (const child of list.children) child.setAttribute('aria-pressed', String(child === item));
                onSelect({ kind: 'preset', id: design.id });
            }); list.append(item);
        }
        return list;
    }
    const STATES = [['idle', '待机', 'fa-face-smile'], ['thinking', '思考', 'fa-lightbulb'], ['working', '干活', 'fa-keyboard'], ['waiting', '等你', 'fa-hand'],
        ['done', '完成', 'fa-check'], ['failed', '失败', 'fa-triangle-exclamation'], ['sleeping', '睡觉', 'fa-moon'], ['greeting', '招呼', 'fa-hand-sparkles']];
    const PARTS = [['shape', '形状'], ['palette', '配色'], ['eyes', '眼睛'], ['mouth', '嘴部'], ['decoration', '装饰']];
    // Local draft editor. The settings owner still owns Save, conflicts and picture uploads.
    function editor({ value, saved, profile, onChange, pictureControls }) {
        const root = el('div', 'pi-avatar-editor');
        const tabs = el('div', 'pi-avatar-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', t('形象来源'));
        const panels = new Map(), tabButtons = new Map(), locks = new Set(), history = [];
        let current = structuredClone(value), mode = value?.kind === 'composed' ? 'compose' : value?.kind === 'image' ? 'picture' : 'preset';
        let state = 'idle', disabled = false, draftImage = null, intersecting = false, popTimer = 0;
        const fallback = () => catalog().toComposition({ kind: 'preset', id: DEFAULT_PRESET_ID });
        const recipeOf = avatar => catalog().toComposition(avatar) || fallback();
        const hero = el('div', 'pi-avatar-hero'), stage = el('div', 'pi-avatar-stage pi-bot-sheet-avatar-face'), caption = el('div', 'pi-avatar-caption');
        const states = el('div', 'pi-avatar-states'); states.setAttribute('role', 'group'); states.setAttribute('aria-label', t('预览形象状态'));
        const visible = () => root.isConnected && (root.checkVisibility ? root.checkVisibility() : root.getClientRects().length > 0);
        const animate = () => { const face = stage.firstElementChild; if (face) face.dataset.avatarLive = String(intersecting && !document.hidden && visible()); };
        const paint = () => {
            const node = render({ ...profile, avatar: current }, 'pi-bot-face is-xl');
            if (draftImage) { const img = el('img'); img.src = draftImage; img.alt = ''; node.replaceChildren(img); node.classList.remove('is-preset'); }
            node.dataset.avatarState = state; stage.replaceChildren(node);
            const design = !draftImage && catalog().resolve(current);
            stage.style.setProperty('--avatar-tint', design ? design.body : 'transparent');
            states.hidden = !design;
            caption.textContent = draftImage || current?.kind === 'image' ? t('自己的图片')
                : current?.kind === 'preset' ? t(catalog().find(current.id)?.name || '预设形象')
                : design ? `${t(design.shape.name)} · ${t(design.palette.name)}` : t('预设形象');
            for (const item of states.children) item.setAttribute('aria-pressed', String(item.dataset.avatarStateOption === state));
            animate();
        };
        for (const [id, label, glyph] of STATES) {
            const item = button(t(label), 'pi-avatar-state', glyph); item.dataset.avatarStateOption = id; item.setAttribute('aria-label', t(label)); item.title = t(label);
            // Pressing the active chip again replays its one-shot motion.
            item.addEventListener('click', () => { state = id; paint(); });
            states.append(item);
        }
        const motionChoice = el('label', 'pi-avatar-motion-choice'), motionInput = el('input'); motionInput.type = 'checkbox'; motionInput.checked = readMotion();
        motionInput.addEventListener('change', () => {
            try { localStorage.setItem('ohmybuddy-avatar-motion', motionInput.checked ? 'on' : 'off'); } catch { /* Current page still honors the preference. */ }
            document.documentElement.dataset.avatarMotion = motionInput.checked ? 'on' : 'off';
        });
        motionChoice.append(motionInput, el('span', 'pi-avatar-switch'), document.createTextNode(t('播放形象动画')));
        hero.append(stage, caption, states, motionChoice);
        const parts = el('div', 'pi-avatar-parts'), controls = new Map();
        function sync() {
            const recipe = recipeOf(current);
            for (const [field, { list, name }] of controls) {
                for (const option of list.children) {
                    const item = catalog().part(field, option.dataset.avatarOption), next = { ...recipe, [field]: item.id };
                    // A shape that cannot wear the current accessory previews, and later applies, without it.
                    if (field === 'shape' && !catalog().compatible(next)) next.decoration = 'none';
                    const fits = catalog().compatible(next);
                    option.disabled = disabled || !fits; option.hidden = Boolean(item.legacy && item.id !== recipe.palette);
                    option.setAttribute('aria-pressed', String(item.id === recipe[field]));
                    option.title = fits ? t(item.name) : t('{0}（这个形状戴不了）', t(item.name));
                    if (field === 'palette') continue;
                    option.replaceChildren(render({ avatar: fits ? next : { ...next, decoration: 'none' } }, 'pi-avatar-mini',
                        { bare: true, focus: field === 'eyes' || field === 'mouth' ? 'face' : undefined }));
                }
                name.textContent = t(catalog().part(field, recipe[field]).name);
            }
            for (const child of presets.children) child.setAttribute('aria-pressed', String(current?.kind === 'preset' && current.id === child.dataset.avatarPreset));
            undo.disabled = disabled || !history.length;
            reset.disabled = disabled || (!draftImage && catalog().same(current, saved));
            paint();
        }
        function choose(next, remember = true) {
            if (disabled) return;
            if (remember && current) { history.push(structuredClone(current)); if (history.length > 30) history.shift(); }
            current = structuredClone(next); sync(); onChange(structuredClone(current));
            stage.classList.remove('is-pop'); void stage.offsetWidth; stage.classList.add('is-pop');
            clearTimeout(popTimer); popTimer = setTimeout(() => stage.classList.remove('is-pop'), 500);
        }
        const presets = choices(current, next => choose(next));
        for (const [field, label] of PARTS) {
            const row = el('div', 'pi-avatar-part'), head = el('div', 'pi-avatar-part-head'), name = el('span', 'pi-avatar-part-name');
            const list = el('div', `pi-avatar-options is-${field}`); list.dataset.avatarPart = field;
            list.setAttribute('role', 'group'); list.setAttribute('aria-label', t(label));
            for (const item of catalog().groups[field]) {
                const option = el('button', `pi-avatar-option is-${field}`); option.type = 'button'; option.dataset.avatarOption = item.id;
                option.setAttribute('aria-label', t(item.name));
                if (field === 'palette') { option.style.setProperty('--swatch', item.body); option.style.setProperty('--swatch-deep', item.deep); option.append(el('span', 'pi-avatar-swatch')); }
                option.addEventListener('click', () => {
                    const recipe = { ...recipeOf(current), [field]: item.id };
                    if (!catalog().compatible(recipe)) recipe.decoration = 'none';
                    choose(recipe);
                });
                list.append(option);
            }
            const lock = button('', 'pi-avatar-lock', 'fa-lock-open'); lock.dataset.avatarLock = field;
            lock.setAttribute('aria-label', t('锁定{0}', t(label))); lock.title = t('随机时保持不变'); lock.setAttribute('aria-pressed', 'false');
            lock.addEventListener('click', () => {
                if (locks.has(field)) locks.delete(field); else locks.add(field);
                lock.setAttribute('aria-pressed', String(locks.has(field)));
                lock.firstElementChild.className = `fa-solid ${locks.has(field) ? 'fa-lock' : 'fa-lock-open'}`;
            });
            controls.set(field, { list, name }); head.append(el('strong', '', t(label)), name, lock); row.append(head, list); parts.append(row);
        }
        const random = button(t('帮我搭一个'), 'pi-avatar-control is-primary', 'fa-dice'); random.dataset.avatarRandom = '';
        random.addEventListener('click', () => {
            choose(catalog().randomize(current, [...locks]));
            random.classList.remove('is-rolling'); void random.offsetWidth; random.classList.add('is-rolling');
        });
        const undo = button(t('撤销'), 'pi-avatar-control', 'fa-rotate-left'); undo.dataset.avatarUndo = '';
        undo.addEventListener('click', () => { if (history.length) choose(history.pop(), false); });
        const reset = button(t('恢复已保存形象'), 'pi-avatar-control is-quiet', 'fa-clock-rotate-left');
        reset.addEventListener('click', () => { choose(saved); show(saved?.kind === 'image' ? 'picture' : saved?.kind === 'composed' ? 'compose' : 'preset'); });
        const adjust = button(t('调整这个形象'), 'pi-avatar-control', 'fa-sliders'); adjust.addEventListener('click', () => { show('compose'); choose(recipeOf(current)); });
        const compositionActions = el('div', 'pi-avatar-editor-actions'); compositionActions.append(random, undo);
        const presetActions = el('div', 'pi-avatar-editor-actions'); presetActions.append(adjust);
        const presetPanel = el('div', 'pi-avatar-panel'); presetPanel.append(presets, presetActions);
        const composePanel = el('div', 'pi-avatar-panel'); composePanel.append(compositionActions, parts);
        const picturePanel = el('div', 'pi-avatar-panel');
        if (pictureControls) picturePanel.append(pictureControls);
        const content = el('div', 'pi-avatar-editor-options');
        for (const [id, label, glyph, panel] of [['preset', '预设', 'fa-shapes', presetPanel], ['compose', '自己搭', 'fa-wand-magic-sparkles', composePanel], ['picture', '自己的图片', 'fa-image', picturePanel]]) {
            const item = button(t(label), 'pi-avatar-tab', glyph); item.dataset.avatarTab = id; tabButtons.set(id, item);
            item.addEventListener('click', () => show(id)); tabs.append(item); panels.set(id, panel); content.append(panel);
        }
        function show(id) {
            mode = id;
            for (const [key, panel] of panels) panel.hidden = key !== id;
            for (const [key, item] of tabButtons) item.setAttribute('aria-pressed', String(key === id));
        }
        const studio = el('div', 'pi-avatar-studio'); studio.append(tabs, content, reset);
        const layout = el('div', 'pi-avatar-editor-layout'); layout.append(hero, studio);
        root.append(layout);
        const observer = new IntersectionObserver(entries => {
            intersecting = entries.some(entry => entry.isIntersecting); animate();
        }); observer.observe(stage);
        document.addEventListener('visibilitychange', animate);
        show(mode); sync();
        return { element: root, sync(next, image) {
            // The owner calls this on every repaint; an unchanged draft must not restart the preview.
            const unchanged = (image || null) === draftImage && catalog().same(current, next);
            draftImage = image || null;
            if (draftImage) { history.length = 0; show('picture'); }
            else if (mode === 'picture' && next?.kind !== 'image') show(next?.kind === 'composed' ? 'compose' : 'preset');
            if (unchanged) return;
            current = structuredClone(next); sync();
        }, setDisabled(value) {
            if (disabled === Boolean(value)) return;
            disabled = Boolean(value);
            for (const node of root.querySelectorAll('button,input')) node.disabled = disabled;
            if (!disabled) sync();
        }, dispose() { clearTimeout(popTimer); stage.firstElementChild?.setAttribute('data-avatar-live', 'false'); observer.disconnect(); document.removeEventListener('visibilitychange', animate); } };
    }
    globalThis.PiAvatar = Object.freeze({ render, choices, editor, greet });
})();
