// Shared static avatar rendering. Only catalog-owned geometry enters SVG attributes.
(() => {
    const ns = 'http://www.w3.org/2000/svg';
    const t = (text, ...args) => globalThis.PiI18n?.t?.(text, ...args) || text;
    const svgNode = (name, attrs = {}) => {
        const node = document.createElementNS(ns, name);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        return node;
    };
    function preset(id) {
        const design = globalThis.PiAvatarPresets?.find(id);
        if (!design) return null;
        const svg = svgNode('svg', { viewBox: '0 0 160 160', 'aria-hidden': 'true', class: 'pi-preset-svg' });
        svg.dataset.preset = design.id;
        for (const [key, value] of Object.entries({ body: design.body, eyes: design.eyes, 'dark-body': design.darkBody, 'dark-eyes': design.darkEyes }))
            svg.style.setProperty(`--avatar-${key}`, value);
        const motion = svgNode('g', { class: 'avatar-motion' });
        motion.append(svgNode('path', { class: 'avatar-body', d: design.path }));
        const gaze = svgNode('g', { class: 'avatar-gaze' }), normal = svgNode('g', { class: 'avatar-normal' });
        for (const x of [61, 91]) normal.append(svgNode('rect', { class: 'avatar-eye', x, y: 63, width: 8, height: 19, rx: 4 }));
        gaze.append(normal);
        for (const [name, d] of [['happy', 'M59 76Q65 65 71 76M89 76Q95 65 101 76'], ['closed', 'M59 76Q65 80 71 76M89 76Q95 80 101 76'], ['sad', 'M59 77L71 72M89 72L101 77']])
            gaze.append(svgNode('path', { class: `avatar-${name}`, d }));
        motion.append(gaze); svg.append(motion);
        for (const [state, mark] of [['waiting', 'M129 24C129 18 138 18 138 24C138 27 133 27 133 30'], ['failed', 'M133 22V30']]) {
            const badge = svgNode('g', { class: `avatar-badge is-${state}` });
            badge.append(svgNode('circle', { class: 'avatar-badge-disc', cx: 133, cy: 29, r: 14 }),
                svgNode('path', { class: 'avatar-badge-mark', d: mark }), svgNode('circle', { class: 'avatar-badge-dot', cx: 133, cy: 35, r: 1.5 }));
            svg.append(badge);
        }
        return svg;
    }
    function render(profile, className = '') {
        const node = document.createElement('span'); node.className = className; node.setAttribute('aria-hidden', 'true');
        const avatar = profile?.avatar;
        if (avatar?.kind === 'preset') {
            const svg = preset(avatar.id);
            if (svg) { node.classList.add('is-preset'); node.append(svg); }
            else { node.dataset.missingPreset = ''; node.textContent = '✨'; }
        } else if (avatar?.kind === 'image' && profile?.id && /^[a-f0-9]{64}$/.test(avatar.version || '')) {
            const img = document.createElement('img'); img.alt = ''; img.decoding = 'async';
            img.src = `/api/pi/profiles/${encodeURIComponent(profile.id)}/avatar?version=${encodeURIComponent(avatar.version)}`;
            img.addEventListener('error', () => { img.remove(); node.textContent = '✨'; }, { once: true }); node.append(img);
        } else node.textContent = avatar?.kind === 'emoji' ? avatar.value : '✨';
        return node;
    }
    function choices(selected, onSelect) {
        const group = document.createElement('div'); group.className = 'pi-avatar-presets';
        group.setAttribute('role', 'group'); group.setAttribute('aria-label', t('预设形象'));
        for (const design of globalThis.PiAvatarPresets?.presets || []) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'pi-avatar-preset';
            button.dataset.avatarPreset = design.id; button.setAttribute('aria-pressed', String(selected?.kind === 'preset' && selected.id === design.id));
            const label = document.createElement('span'); label.textContent = t(design.name);
            button.append(render({ avatar: { kind: 'preset', id: design.id } }, 'pi-bot-face is-lg'), label);
            button.addEventListener('click', () => {
                for (const child of group.children) child.setAttribute('aria-pressed', String(child === button));
                onSelect({ kind: 'preset', id: design.id });
            });
            group.append(button);
        }
        return group;
    }
    globalThis.PiAvatar = Object.freeze({ render, choices });
})();
