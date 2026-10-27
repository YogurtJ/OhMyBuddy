/* Shared, keyboard-accessible confirmations for the profile editors. */
(() => {
    'use strict';
    let pending = null;
    function confirm({ title, message, items, tone = 'danger', accept, cancelLabel, current = () => true }) {
        if (pending) return Promise.resolve(false);
        const t = text => globalThis.PiI18n?.t(text) || text;
        const focus = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.className = 'pi-profile-confirm';
        dialog.setAttribute('aria-labelledby', 'pi-profile-confirm-title');
        dialog.setAttribute('aria-describedby', 'pi-profile-confirm-message');
        const heading = document.createElement('h2'); heading.id = 'pi-profile-confirm-title'; heading.textContent = title;
        let body;
        if (Array.isArray(items) && items.length) {
            body = document.createElement('ul');
            body.id = 'pi-profile-confirm-message';
            body.className = 'pi-profile-confirm-list';
            for (const item of items) {
                if (!item || !item.text) continue;
                const li = document.createElement('li');
                li.className = `pi-profile-confirm-item${item.tone ? ` is-${item.tone}` : ''}`;
                if (item.icon) {
                    const icon = document.createElement('i');
                    icon.className = `fa-solid ${item.icon} pi-profile-confirm-icon`;
                    icon.setAttribute('aria-hidden', 'true');
                    li.append(icon);
                }
                const copy = document.createElement('div');
                copy.className = 'pi-profile-confirm-copy';
                if (item.title) {
                    const strong = document.createElement('strong');
                    strong.textContent = item.title;
                    copy.append(strong);
                }
                const span = document.createElement('span');
                span.textContent = item.text;
                copy.append(span);
                li.append(copy);
                body.append(li);
            }
        } else {
            body = document.createElement('p');
            body.id = 'pi-profile-confirm-message';
            body.textContent = message;
        }
        const actions = document.createElement('div'); actions.className = 'pi-profile-confirm-actions';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'settings-secondary-button'; cancel.textContent = cancelLabel || t('继续编辑');
        const proceed = document.createElement('button'); proceed.type = 'button';
        proceed.className = `settings-primary-button${tone === 'primary' ? ' pi-profile-confirm-primary' : ' pi-profile-confirm-discard'}`;
        proceed.textContent = accept;
        actions.append(cancel, proceed); dialog.append(heading, body, actions);
        return new Promise(resolve => {
            const finish = value => {
                pending = null; dialog.close(); dialog.remove();
                if (current() && focus?.isConnected) focus.focus({ preventScroll: true });
                resolve(value);
            };
            pending = () => finish(false);
            cancel.onclick = () => finish(false); proceed.onclick = () => finish(true);
            dialog.oncancel = event => { event.preventDefault(); finish(false); };
            document.body.append(dialog); dialog.showModal(); cancel.focus();
        });
    }
    globalThis.PiProfileDialog = Object.freeze({ confirm, cancel: () => pending?.() });
})();
