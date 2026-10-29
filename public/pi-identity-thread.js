// "以身份新建…" in a Pi Agent project (M4-6, D-025): pick one of the user's identities (assistant
// identities and Bots) for a new, ordinary Pi thread in a real project folder. The thread uses the
// identity's personality, memory and skills; it is not a Bot chat, and Pi Agent's own tools and
// permissions apply. Returns the chosen profile ID, or null when cancelled.
(() => {
    'use strict';
    const t = (text, ...values) => globalThis.PiI18n?.t?.(text, ...values) || String(text).replace(/\{(\d+)\}/g, (_, i) => values[i] ?? '');
    const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
    const LAST = 'pivane.identityThread.last';
    let open = null;

    function remembered() { try { return localStorage.getItem(LAST) || ''; } catch { return ''; } }
    function remember(id) { try { localStorage.setItem(LAST, id); } catch {} }

    // choose({ apiFetch, projectName }) → Promise<string|null>
    function choose({ apiFetch, projectName }) {
        if (open) return Promise.resolve(null);
        const focus = document.activeElement;
        const dialog = el('dialog', 'pi-identity-thread');
        dialog.setAttribute('aria-labelledby', 'pi-identity-thread-title');
        const form = el('form'); form.method = 'dialog';
        const title = el('h2', null, t('以身份新建线程')); title.id = 'pi-identity-thread-title';
        const note = el('p', 'pi-identity-thread-note', t('在“{0}”里新开一个普通 Pi 线程，用所选身份的性格、记忆和技能。工具和权限与工作台相同，不受伙伴的做事方式限制；它不会出现在伙伴的聊天里。', projectName));
        const list = el('div', 'pi-identity-thread-list'); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-labelledby', title.id);
        list.append(el('p', 'pi-identity-thread-state', t('正在读取…')));
        const actions = el('div', 'pi-identity-thread-actions');
        const cancel = el('button', 'settings-secondary-button', t('取消')); cancel.type = 'button';
        const create = el('button', 'settings-primary-button', t('新建线程')); create.type = 'submit'; create.disabled = true;
        actions.append(cancel, create);
        form.append(title, note, list, actions);
        dialog.append(form);
        let chosen = '';
        const pick = () => { chosen = list.querySelector('input:checked')?.value || ''; create.disabled = !chosen; };

        async function load() {
            list.replaceChildren(el('p', 'pi-identity-thread-state', t('正在读取…')));
            create.disabled = true;
            try {
                const data = await apiFetch('/api/pi/profiles');
                if (!dialog.open) return;
                const profiles = (data?.profiles || []).filter(profile => profile && profile.enabled && profile.trashedAt === undefined);
                if (!profiles.length) {
                    const empty = el('div', 'pi-identity-thread-state');
                    const go = el('button', 'settings-secondary-button', t('去身份页')); go.type = 'button';
                    go.addEventListener('click', () => { finish(null); window.PiWorkspaceRoute?.navigate('profiles'); });
                    empty.append(el('p', null, t('还没有可用的身份。可以在“身份”页新建，或先建一个伙伴。')), go);
                    list.replaceChildren(empty);
                    return;
                }
                const last = remembered();
                const preferred = profiles.some(profile => profile.id === last) ? last : profiles[0].id;
                list.replaceChildren(...profiles.map(profile => {
                    const row = el('label', 'pi-identity-thread-row');
                    const input = el('input'); input.type = 'radio'; input.name = 'pi-identity-thread'; input.value = profile.id; input.checked = profile.id === preferred;
                    const face = globalThis.PiAvatar ? globalThis.PiAvatar.render(profile, 'pi-identity-avatar') : el('span', 'pi-identity-avatar', (profile.name || '?').slice(0, 1));
                    const copy = el('span', 'pi-identity-thread-copy');
                    const name = el('strong', null, profile.name);
                    if (profile.bot) name.append(el('span', 'pi-identity-thread-tag', t('伙伴')));
                    copy.append(name);
                    if (profile.description) copy.append(el('small', null, profile.description));
                    row.append(input, face, copy);
                    return row;
                }));
                pick();
            } catch (error) {
                if (!dialog.open) return;
                const failed = el('div', 'pi-identity-thread-state');
                const retry = el('button', 'settings-secondary-button', t('重试')); retry.type = 'button';
                retry.addEventListener('click', () => void load());
                failed.append(el('p', null, t('读取身份失败：{0}', error.message || '')), retry);
                list.replaceChildren(failed);
            }
        }

        let resolver;
        const finish = value => {
            if (!open) return;
            open = null; dialog.close(); dialog.remove();
            if (focus?.isConnected) focus.focus({ preventScroll: true });
            if (value) remember(value);
            resolver(value);
        };
        list.addEventListener('change', pick);
        cancel.addEventListener('click', () => finish(null));
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
        form.addEventListener('submit', event => { event.preventDefault(); if (chosen) finish(chosen); });
        return new Promise(resolve => {
            resolver = resolve; open = dialog;
            document.body.append(dialog); dialog.showModal(); cancel.focus();
            void load().then(() => { if (dialog.open) (list.querySelector('input:checked') || cancel).focus(); });
        });
    }

    globalThis.PiIdentityThread = Object.freeze({ choose, cancel: () => open?.dispatchEvent(new Event('cancel')) });
})();
