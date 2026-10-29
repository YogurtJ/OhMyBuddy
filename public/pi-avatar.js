// Only catalog-owned geometry enters SVG. User recipes contain versioned part IDs, never markup.
(() => {
    const ns = 'http://www.w3.org/2000/svg';
    const t = (text, ...args) => globalThis.PiI18n?.t?.(text, ...args) || text;
    const catalog = () => globalThis.PiAvatarPresets;
    const readMotion = () => { try { return localStorage.getItem('ohmybuddy-avatar-motion') !== 'off'; } catch { return true; } };
    const syncMotion = () => { document.documentElement.dataset.avatarMotion = readMotion() ? 'on' : 'off'; };
    syncMotion();
    window.addEventListener('storage', event => { if (event.key === 'ohmybuddy-avatar-motion' || event.key === null) syncMotion(); });
    const svgNode = (name, attrs = {}) => {
        const node = document.createElementNS(ns, name);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        return node;
    };
    const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
    const button = (label, cls = 'pi-avatar-control') => { const node = el('button', cls, label); node.type = 'button'; return node; };
    function vector(avatar) {
        const design = catalog()?.resolve(avatar);
        if (!design) return null;
        const { recipe, shape } = design;
        const svg = svgNode('svg', { viewBox: '0 0 160 160', 'aria-hidden': 'true', class: 'pi-preset-svg' });
        if (avatar.kind === 'preset') svg.dataset.preset = avatar.id;
        else svg.dataset.composed = String(recipe.version);
        for (const [key, value] of Object.entries({ body: design.body, eyes: design.eyes, 'dark-body': design.darkBody, 'dark-eyes': design.darkEyes }))
            svg.style.setProperty(`--avatar-${key}`, value);
        svg.style.setProperty('--avatar-breathe-x', String(1 + .013 * shape.squash));
        svg.style.setProperty('--avatar-breathe-y', String(1 - .015 * shape.squash));
        const motion = svgNode('g', { class: 'avatar-motion' });
        const body = svgNode('g', { class: 'avatar-breath' }); motion.append(body);
        const decoration = recipe.decoration;
        if (decoration === 'sprout') {
            const sprout = svgNode('g', { class: 'avatar-decoration', transform: `translate(80 ${shape.top})` });
            sprout.append(svgNode('path', { d: 'M0 6V-8M0-3Q-18-2-17-15Q-3-17 0-3M0-5Q15-7 17-20Q2-21 0-5', class: 'avatar-sprout' }));
            body.append(sprout);
        } else if (decoration === 'antenna') {
            const antenna = svgNode('g', { class: 'avatar-decoration', transform: `translate(80 ${shape.top})` });
            antenna.append(svgNode('path', { d: 'M0 4V-17', class: 'avatar-antenna' }), svgNode('circle', { cx: 0, cy: -19, r: 5, class: 'avatar-antenna-tip' })); body.append(antenna);
        }
        body.append(svgNode('path', { class: 'avatar-body', d: design.path }));
        const [x, y, scale] = shape.face;
        const face = svgNode('g', { class: 'avatar-face', transform: `translate(${x} ${y}) scale(${scale})` });
        const gaze = svgNode('g', { class: 'avatar-gaze' }), normal = svgNode('g', { class: 'avatar-normal' });
        for (const cx of [-15, 15]) {
            const attrs = { class: 'avatar-eye' };
            if (recipe.eyes === 'dot') normal.append(svgNode('circle', { ...attrs, cx, cy: 0, r: 5.3 }));
            else if (recipe.eyes === 'oval') normal.append(svgNode('ellipse', { ...attrs, cx, cy: 0, rx: 5, ry: 8 }));
            else normal.append(svgNode('rect', { ...attrs, x: cx - (recipe.eyes === 'display' ? 7 : 4), y: recipe.eyes === 'display' ? -4 : -10,
                width: recipe.eyes === 'display' ? 14 : 8, height: recipe.eyes === 'display' ? 8 : 19, rx: recipe.eyes === 'display' ? 3 : 4 }));
        }
        gaze.append(normal);
        for (const [name, d] of [['happy', 'M-21 3Q-15-8-9 3M9 3Q15-8 21 3'], ['closed', 'M-21 3Q-15 7-9 3M9 3Q15 7 21 3'], ['sad', 'M-21 4L-9-1M9-1L21 4']])
            gaze.append(svgNode('path', { class: `avatar-${name}`, d }));
        if (decoration === 'blush') for (const cx of [-27, 27]) gaze.append(svgNode('ellipse', { class: 'avatar-blush', cx, cy: 13, rx: 7, ry: 3.5 }));
        if (recipe.mouth === 'smile') gaze.append(svgNode('path', { class: 'avatar-mouth', d: 'M-4 15Q0 19 4 15' }));
        face.append(gaze); body.append(face); svg.append(motion);
        // Decorative only; accessible actions and status text live outside this aria-hidden SVG.
        for (const [state, mark] of [['waiting', 'M129 24C129 18 138 18 138 24C138 27 133 27 133 30'], ['failed', 'M133 22V30']]) {
            const badge = svgNode('g', { class: `avatar-badge is-${state}` });
            badge.append(svgNode('circle', { class: 'avatar-badge-disc', cx: 133, cy: 29, r: 14 }),
                svgNode('path', { class: 'avatar-badge-mark', d: mark }), svgNode('circle', { class: 'avatar-badge-dot', cx: 133, cy: 35, r: 1.5 })); svg.append(badge);
        }
        return svg;
    }
    const DEFAULT_PRESET_ID = 'pivane-pebble';
    function fallbackPreset(node) {
        const svg = vector({ kind: 'preset', id: DEFAULT_PRESET_ID });
        if (svg) { node.classList.add('is-preset'); node.append(svg); }
    }
    function render(profile, className = '') {
        const node = el('span', className); node.setAttribute('aria-hidden', 'true');
        const avatar = profile?.avatar;
        if (avatar?.kind === 'preset' || avatar?.kind === 'composed') {
            const svg = vector(avatar);
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
    function choices(selected, onSelect) {
        const group = el('div', 'pi-avatar-presets');
        group.setAttribute('role', 'group'); group.setAttribute('aria-label', t('预设形象'));
        for (const design of catalog()?.presets || []) {
            const item = button('', 'pi-avatar-preset');
            item.dataset.avatarPreset = design.id; item.setAttribute('aria-pressed', String(selected?.kind === 'preset' && selected.id === design.id));
            item.append(render({ avatar: { kind: 'preset', id: design.id } }, 'pi-bot-face is-lg'), el('span', '', t(design.name)));
            item.addEventListener('click', () => {
                for (const child of group.children) child.setAttribute('aria-pressed', String(child === item));
                onSelect({ kind: 'preset', id: design.id });
            }); group.append(item);
        }
        return group;
    }
    // Local draft editor. The settings owner still owns Save, conflicts and picture uploads.
    function editor({ value, saved, profile, onChange, pictureControls }) {
        const root = el('div', 'pi-avatar-editor');
        const tabs = el('div', 'pi-avatar-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', t('形象来源'));
        const panels = new Map(), tabButtons = new Map(), locks = new Set(), history = [];
        let current = structuredClone(value), mode = value?.kind === 'composed' ? 'compose' : value?.kind === 'image' ? 'picture' : 'preset';
        let state = 'idle', playing = false, disabled = false, draftImage = null, intersecting = false;
        const preview = el('div', 'pi-avatar-preview'), stage = el('div', 'pi-avatar-stage pi-bot-sheet-avatar-face');
        const stateLabel = el('span', 'pi-avatar-preview-label');
        const states = el('select'); states.setAttribute('aria-label', t('预览形象状态'));
        for (const [id, label] of [['idle', '待机'], ['thinking', '思考'], ['working', '工作中'], ['waiting', '等你回复'], ['done', '完成'], ['failed', '失败'], ['sleeping', '睡觉'], ['greeting', '打招呼']]) {
            const option = el('option', '', t(label)); option.value = id; states.append(option);
        }
        const play = button(t('播放动作')); play.setAttribute('aria-pressed', 'false');
        const visible = () => root.isConnected && (root.checkVisibility ? root.checkVisibility() : root.getClientRects().length > 0);
        const animate = () => { const face = stage.firstElementChild; if (face) face.dataset.avatarLive = String(playing && intersecting && !document.hidden && visible()); };
        const paint = () => {
            const node = render({ ...profile, avatar: current }, 'pi-bot-face is-xl');
            if (draftImage) { const img = el('img'); img.src = draftImage; img.alt = ''; node.replaceChildren(img); node.classList.remove('is-preset'); }
            node.dataset.avatarState = state; stage.replaceChildren(node);
            stateLabel.textContent = states.selectedOptions[0].textContent; animate();
        };
        states.addEventListener('change', () => { state = states.value; paint(); });
        play.addEventListener('click', () => { playing = !playing; play.textContent = playing ? t('暂停动作') : t('播放动作'); play.setAttribute('aria-pressed', String(playing)); animate(); });
        const previewTools = el('div', 'pi-avatar-preview-tools'); previewTools.append(states, play);
        preview.append(stage, stateLabel, previewTools);
        const motionChoice = el('label', 'pi-avatar-motion-choice'), motionInput = el('input'); motionInput.type = 'checkbox'; motionInput.checked = readMotion();
        motionInput.addEventListener('change', () => {
            try { localStorage.setItem('ohmybuddy-avatar-motion', motionInput.checked ? 'on' : 'off'); } catch { /* Current page still honors the preference. */ }
            document.documentElement.dataset.avatarMotion = motionInput.checked ? 'on' : 'off';
        });
        motionChoice.append(motionInput, document.createTextNode(t('播放形象动画')));
        preview.append(motionChoice);
        const parts = el('div', 'pi-avatar-parts'), controls = new Map();
        function sync() {
            const recipe = catalog().toComposition(current) || catalog().toComposition({ kind: 'preset', id: DEFAULT_PRESET_ID });
            for (const [field, select] of controls) {
                for (const option of select.options) {
                    const item = catalog().part(field, option.value);
                    option.disabled = field === 'decoration' && !catalog().compatible({ ...recipe, decoration: item.id });
                    if (field === 'palette') option.hidden = Boolean(item.legacy && item.id !== recipe.palette);
                }
                select.value = recipe[field];
            }
            for (const child of presets.children) child.setAttribute('aria-pressed', String(current?.kind === 'preset' && current.id === child.dataset.avatarPreset));
            undo.disabled = disabled || !history.length; paint();
        }
        function choose(next, remember = true) {
            if (disabled) return;
            if (remember && current) { history.push(structuredClone(current)); if (history.length > 30) history.shift(); }
            current = structuredClone(next); sync(); onChange(structuredClone(current));
        }
        const presets = choices(current, next => choose(next));
        for (const [field, label] of [['shape', '形状'], ['palette', '配色'], ['eyes', '眼睛'], ['mouth', '嘴部'], ['decoration', '装饰']]) {
            const row = el('div', 'pi-avatar-part'), wrap = el('label');
            const select = el('select'); select.dataset.avatarPart = field;
            select.setAttribute('aria-label', t(label));
            for (const item of catalog().groups[field]) { const option = el('option', '', t(item.name)); option.value = item.id; select.append(option); }
            const lock = button(t('锁定')); lock.dataset.avatarLock = field; lock.setAttribute('aria-label', t('锁定{0}', t(label))); lock.setAttribute('aria-pressed', 'false');
            lock.addEventListener('click', () => { if (locks.has(field)) locks.delete(field); else locks.add(field); lock.setAttribute('aria-pressed', String(locks.has(field))); });
            select.addEventListener('change', () => {
                const recipe = catalog().toComposition(current) || catalog().toComposition({ kind: 'preset', id: DEFAULT_PRESET_ID });
                recipe[field] = select.value;
                if (!catalog().compatible(recipe)) recipe.decoration = 'none';
                choose(recipe);
            });
            controls.set(field, select); wrap.append(el('span', '', t(label)), select); row.append(wrap, lock); parts.append(row);
        }
        const random = button(t('帮我搭一个')); random.dataset.avatarRandom = '';
        random.addEventListener('click', () => choose(catalog().randomize(current, [...locks])));
        const undo = button(t('撤销')); undo.dataset.avatarUndo = '';
        undo.addEventListener('click', () => { if (history.length) choose(history.pop(), false); });
        const reset = button(t('恢复已保存形象')); reset.addEventListener('click', () => { choose(saved); show(saved?.kind === 'image' ? 'picture' : saved?.kind === 'composed' ? 'compose' : 'preset'); });
        const adjust = button(t('调整这个形象')); adjust.addEventListener('click', () => {
            show('compose'); choose(catalog().toComposition(current) || catalog().toComposition({ kind: 'preset', id: DEFAULT_PRESET_ID }));
        });
        const compositionActions = el('div', 'pi-avatar-editor-actions'); compositionActions.append(random, undo);
        const presetPanel = el('div'); presetPanel.append(presets, adjust);
        const composePanel = el('div'); composePanel.append(parts, compositionActions);
        const picturePanel = el('div');
        if (pictureControls) picturePanel.append(pictureControls);
        const content = el('div', 'pi-avatar-editor-options');
        for (const [id, label, panel] of [['preset', '预设', presetPanel], ['compose', '组合', composePanel], ['picture', '自己的图片', picturePanel]]) {
            const item = button(t(label)); item.dataset.avatarTab = id; tabButtons.set(id, item);
            item.addEventListener('click', () => show(id)); tabs.append(item); panels.set(id, panel); content.append(panel);
        }
        function show(id) {
            mode = id;
            for (const [key, panel] of panels) panel.hidden = key !== id;
            for (const [key, item] of tabButtons) item.setAttribute('aria-pressed', String(key === id));
        }
        const layout = el('div', 'pi-avatar-editor-layout'); layout.append(preview, content);
        root.append(tabs, layout, reset);
        const observer = new IntersectionObserver(entries => {
            intersecting = entries.some(entry => entry.isIntersecting); animate();
        }); observer.observe(stage);
        document.addEventListener('visibilitychange', animate);
        show(mode); sync();
        return { element: root, sync(next, image) {
            draftImage = image || null;
            if (draftImage) { history.length = 0; show('picture'); }
            else if (mode === 'picture' && next?.kind !== 'image') show(next?.kind === 'composed' ? 'compose' : 'preset');
            if (!catalog().same(current, next)) { current = structuredClone(next); sync(); }
            else paint();
        }, setDisabled(value) {
            disabled = value;
            for (const node of root.querySelectorAll('button,select,input')) node.disabled = value;
            undo.disabled = value || !history.length;
        }, dispose() { playing = false; animate(); observer.disconnect(); document.removeEventListener('visibilitychange', animate); } };
    }
    globalThis.PiAvatar = Object.freeze({ render, choices, editor });
})();
