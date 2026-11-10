// Regenerate the static preset pictures in public/bot-avatars from the real browser renderer.
// Run after adding or restyling a catalog preset:
//   PLAYWRIGHT_MODULE=/path/to/playwright node scripts/build-avatar-assets.cjs
// The three original pivane-* files are frozen prototypes and are never rewritten.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), pub = path.join(root, 'public');
const catalog = require(path.join(pub, 'pi-avatar-presets.js'));

(async () => {
    const options = { headless: true };
    if (process.env.CHROMIUM_PATH) options.executablePath = process.env.CHROMIUM_PATH;
    else if (process.env.PLAYWRIGHT_CHANNEL) options.channel = process.env.PLAYWRIGHT_CHANNEL;
    const browser = await chromium.launch(options);
    try {
        const page = await browser.newPage();
        await page.setContent(`<!doctype html><html data-theme="daylight"><head><style>${fs.readFileSync(path.join(pub, 'pi-avatar.css'), 'utf8')}</style></head><body></body></html>`);
        for (const script of ['pi-avatar-presets.js', 'pi-avatar.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(pub, script), 'utf8') });
        const pictures = await page.evaluate(() => PiAvatarPresets.presets.filter(preset => !preset.id.startsWith('pivane-')).map(preset => {
            const holder = PiAvatar.render({ avatar: { kind: 'preset', id: preset.id } }, 'pi-bot-face is-xl', { bare: true });
            holder.dataset.avatarState = 'idle'; document.body.replaceChildren(holder);
            const svg = holder.querySelector('svg');
            // color-mix() computes to color(srgb ...); plain rgb()/rgba() is what every SVG viewer reads.
            const color = value => value.replace(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/, (_all, r, g, b, a) =>
                `rgba(${[r, g, b].map(part => Math.round(part * 255)).join(', ')}, ${a === undefined ? 1 : Number(a)})`);
            // Resolve the stylesheet into attributes first, then strip every class, variable and hidden layer.
            const styles = new Map([...svg.querySelectorAll('*')].map(node => [node, getComputedStyle(node)]));
            for (const [node, style] of styles) {
                if (node.closest('clipPath')) continue;
                if (style.display === 'none') { node.dataset.drop = ''; continue; }
                if (style.opacity !== '1') node.setAttribute('opacity', style.opacity);
                if (node.tagName === 'g') continue;
                node.setAttribute('fill', color(style.fill));
                if (style.stroke === 'none') continue;
                node.setAttribute('stroke', color(style.stroke)); node.setAttribute('stroke-width', String(parseFloat(style.strokeWidth)));
                if (style.strokeLinecap !== 'butt') node.setAttribute('stroke-linecap', style.strokeLinecap);
                if (style.strokeLinejoin !== 'miter') node.setAttribute('stroke-linejoin', style.strokeLinejoin);
            }
            for (const node of svg.querySelectorAll('[data-drop]')) node.remove();
            for (const node of [svg, ...svg.querySelectorAll('*')]) { node.removeAttribute('class'); node.removeAttribute('style'); for (const key of Object.keys(node.dataset)) if (key !== 'preset') delete node.dataset[key]; }
            const clip = svg.querySelector('clipPath'); clip.id = 'avatar-clip';
            svg.querySelector('[clip-path]').setAttribute('clip-path', 'url(#avatar-clip)');
            svg.removeAttribute('aria-hidden'); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `OhMyBuddy ${preset.name}`);
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title'); title.textContent = `OhMyBuddy ${preset.name}`; svg.prepend(title);
            svg.removeAttribute('style');
            return { asset: preset.asset, svg: new XMLSerializer().serializeToString(svg).replaceAll(' style=""', '') };
        }));
        for (const { asset, svg } of pictures) {
            if (!/^bot-avatars\/[a-z0-9-]+\.svg$/.test(asset) || /<script|<foreignObject|<image|\son[a-z]+=|href=/i.test(svg) || /url\((?!#avatar-clip\))/.test(svg)) throw new Error(`Unsafe picture for ${asset}`);
            fs.writeFileSync(path.join(pub, asset), svg + '\n');
        }
        console.log(`Wrote ${pictures.length} preset pictures; kept ${catalog.presets.length - pictures.length} original prototypes.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
