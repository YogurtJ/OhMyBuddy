(() => {
    // Topic editor sheet: an identity row (icon + name), the topic's focus, optional standing
    // instructions and the topic's lifecycle actions. Only changed fields are saved against the
    // windows revision; a conflict keeps the draft and is never replayed automatically.
    const translateUi = globalThis.PiI18n?.t || ((text, ...values) => text.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? `{${index}}`));
    const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
    const icon = name => { const i = el('i', `fa-solid ${name}`); i.setAttribute('aria-hidden', 'true'); return i; };
    const button = (className, text) => { const b = el('button', className, text); b.type = 'button'; return b; };
    const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const url = (profileId, windowId) => `/api/pi/bots/${encodeURIComponent(profileId)}/windows${windowId ? `/${encodeURIComponent(windowId)}` : ''}`;
    const stale = error => error?.status === 409 && !error.code;
    const clean = value => String(value ?? '').replace(/ *[\x00-\x1f\x7f][\x00-\x1f\x7f ]*/g, ' ').trim();
    const cleanLines = value => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim();
    const tidy = (key, value) => key === 'instructions' ? cleanLines(value) : clean(value);
    const bytes = value => new TextEncoder().encode(value).length;
    const fitTextarea = area => window.PiBot?.fitTextarea?.(area);
    const INSTRUCTION_BYTES = 8192;
    const EMOJI = ['📖', '📚', '❓', '🌍', '💬', '💻', '🧰', '🧭', '📝', '🎯', '🎨', '🏡', '🎵', '💡', '🏃', '🍳', '📊', '🧪', '🧩', '✈️'];
    let dialog = null;

    // edit({ api, profileId, name, bot, window, current, latest, onSaved, limits, problem, refusal })
    function edit(options) {
        dialog?.close();
        const LIMITS = options.limits, creating = !options.window;
        const sheet = el('dialog', 'pi-bot-sheet pi-bot-topic-sheet'); dialog = sheet;
        sheet.setAttribute('aria-labelledby', 'pi-bot-topic-title');
        const form = el('form', 'pi-bot-sheet-form'); form.method = 'dialog'; form.noValidate = true;
        const head = el('header', 'pi-bot-sheet-head');
        const title = el('h2', null, creating ? translateUi("新话题") : translateUi("编辑话题")); title.id = 'pi-bot-topic-title';
        const close = button('pi-bot-sheet-close'); close.setAttribute('aria-label', translateUi("关闭")); close.title = translateUi("关闭"); close.append(icon('fa-xmark'));
        head.append(title, close);

        const own = topic => ({ title: topic?.title || '', focus: topic?.focus || '', instructions: topic?.instructions || '', emoji: topic?.emoji || '', groupId: topic?.groupId || '' });
        let revision = options.bot.windowsRevision, base = own(creating ? null : options.window);
        let busy = false, warned = null, archiveArmed = false, trashArmed = false, gone = false;

        // Identity: an icon slot that is empty until chosen, beside the name.
        const hero = el('section', 'pi-bot-topic-hero');
        const slot = el('div', 'pi-bot-topic-icon-slot');
        const face = button('pi-bot-topic-face'); face.dataset.topicIcon = 'true';
        face.setAttribute('aria-haspopup', 'dialog'); face.setAttribute('aria-expanded', 'false');
        const panel = el('div', 'pi-bot-topic-emoji-panel'); panel.hidden = true; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', translateUi("选择图标"));
        const choices = el('div', 'pi-bot-topic-emoji-choices');
        const emoji = el('input', 'pi-bot-topic-emoji-input'); emoji.type = 'text'; emoji.maxLength = LIMITS.emoji; emoji.autocomplete = 'off';
        emoji.dataset.topicField = 'emoji'; emoji.placeholder = translateUi("粘贴其他表情"); emoji.setAttribute('aria-label', translateUi("自定义图标"));
        const removeIcon = button('pi-bot-topic-text-button', translateUi("不使用图标"));
        const custom = el('div', 'pi-bot-topic-emoji-custom'); custom.append(emoji, removeIcon);
        panel.append(el('p', 'pi-bot-topic-emoji-title', translateUi("选择图标")), choices, custom);
        const setEmoji = value => { emoji.value = value; emoji.dispatchEvent(new Event('input', { bubbles: true })); };
        for (const value of EMOJI) {
            const choose = button('pi-bot-topic-emoji-option', value); choose.setAttribute('aria-label', translateUi("使用图标 {0}", value));
            choose.addEventListener('click', () => { setEmoji(value); togglePanel(false); face.focus(); }); choices.append(choose);
        }
        removeIcon.addEventListener('click', () => { setEmoji(''); togglePanel(false); face.focus(); });
        slot.append(face, panel);
        const name = el('input', 'pi-bot-topic-name'); name.type = 'text'; name.maxLength = LIMITS.title; name.required = true; name.autocomplete = 'off';
        name.dataset.topicField = 'title'; name.placeholder = translateUi("给话题起个名字"); name.setAttribute('aria-label', translateUi("话题名"));
        const copy = el('div', 'pi-bot-topic-hero-copy');
        copy.append(name, el('p', 'pi-bot-topic-hero-hint', translateUi("{0} 在这里专注这件事，重要事项在所有聊天中共享。", options.name || translateUi('伙伴'))));
        hero.append(slot, copy);
        function togglePanel(open = panel.hidden) {
            panel.hidden = !open; face.setAttribute('aria-expanded', String(open));
            if (open) (choices.querySelector('[aria-pressed="true"]') || choices.firstElementChild)?.focus();
        }
        face.addEventListener('click', () => togglePanel());
        panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); togglePanel(false); face.focus(); } });
        sheet.addEventListener('pointerdown', event => { if (!panel.hidden && !slot.contains(event.target)) togglePanel(false); });

        // Group: one compact row.
        const group = el('select', 'pi-bot-topic-group-select'); group.dataset.topicField = 'groupId'; group.setAttribute('aria-label', translateUi("分组"));
        const fillGroups = (bot, selected) => {
            group.replaceChildren(new Option(translateUi("未分组"), ''), ...(bot.groups || []).map(item => new Option(item.name, item.id)));
            group.value = selected || '';
        };
        fillGroups(options.bot, base.groupId);
        const groupRow = el('label', 'pi-bot-topic-setting');
        const groupCopy = el('span', 'pi-bot-topic-setting-copy'); groupCopy.append(icon('fa-folder'), el('span', null, translateUi("分组")));
        groupRow.append(groupCopy, group);

        // Focus: a counter instead of a paragraph; the hint appears while typing.
        const focus = el('textarea'); focus.rows = 2; focus.maxLength = LIMITS.focus; focus.dataset.topicField = 'focus';
        focus.placeholder = translateUi("比如：讨论需求、实现思路和待解决的问题");
        const focusCount = el('span', 'pi-bot-topic-count');
        const focusField = el('label', 'pi-bot-topic-field');
        const focusHead = el('span', 'pi-bot-topic-field-head'); focusHead.append(el('span', 'pi-bot-sheet-label', translateUi("专注什么")), focusCount);
        focusField.append(focusHead, focus, el('span', 'pi-bot-topic-field-hint', translateUi("伙伴据此把握聊天重点，可以随时修改。")));

        // Instructions: optional, collapsed until used.
        const instructions = el('textarea', 'pi-bot-sheet-long is-instructions'); instructions.rows = 3; instructions.maxLength = INSTRUCTION_BYTES;
        instructions.dataset.topicField = 'instructions'; instructions.placeholder = translateUi("比如：先给结论再展开；改代码前先说明思路和影响。");
        instructions.setAttribute('aria-label', translateUi("话题指令"));
        const rules = el('details', 'pi-bot-topic-rules'); rules.dataset.topicRules = 'true';
        const rulesSummary = el('summary'), rulesPreview = el('span', 'pi-bot-topic-rules-preview'), rulesCount = el('span', 'pi-bot-topic-count');
        const rulesTitle = el('span', 'pi-bot-topic-rules-title'); rulesTitle.append(icon('fa-list-check'), el('span', null, translateUi("话题指令")), el('small', 'pi-bot-topic-optional', translateUi("可选")));
        rulesSummary.append(rulesTitle, rulesPreview, icon('fa-chevron-down'));
        const rulesFoot = el('span', 'pi-bot-topic-field-head'); rulesFoot.append(el('span', 'pi-bot-topic-rules-help', translateUi("这个话题里一直遵守的做法，比如回答格式、资料来源。")), rulesCount);
        rules.append(rulesSummary, instructions, rulesFoot);
        let unfolding = false;
        rulesSummary.addEventListener('click', () => { unfolding = !rules.open; });
        rules.addEventListener('toggle', () => { if (rules.open) { fitTextarea(instructions); if (unfolding) instructions.focus(); } unfolding = false; });

        const fill = values => {
            name.value = values.title; focus.value = values.focus; instructions.value = values.instructions; emoji.value = values.emoji; group.value = values.groupId;
            rules.open = Boolean(values.instructions.trim()); fitTextarea(instructions);
        };
        fill(base);
        const body = el('div', 'pi-bot-sheet-body');
        body.append(hero, groupRow, focusField, rules);

        // Lifecycle actions, kept apart from the fields.
        let archive = null, trash = null;
        if (!creating) {
            const manage = el('section', 'pi-bot-topic-lifecycle');
            const row = el('div', 'pi-bot-topic-lifecycle-actions');
            if (!options.window.archivedAt) {
                archive = button('pi-bot-topic-lifecycle-button'); archive.dataset.topicAction = 'archive';
                archive.append(icon('fa-box-archive'), el('span', null, translateUi("归档"))); row.append(archive);
            }
            trash = button('pi-bot-topic-lifecycle-button is-danger pi-bot-topic-trash'); trash.dataset.topicAction = 'trash';
            trash.append(icon('fa-trash-can'), el('span', null, translateUi("移到回收站"))); row.append(trash);
            manage.append(row, el('p', 'pi-bot-topic-lifecycle-note', options.window.archivedAt
                ? translateUi("整个话题连同更早的聊天会进入回收站，可以恢复。记事本中的事项继续保留。")
                : translateUi("归档会收起话题并保留记录；移到回收站可在整理话题里恢复。")));
            body.append(manage);
        }
        const foot = el('footer', 'pi-bot-sheet-foot');
        const status = el('p', 'pi-bot-sheet-status'); status.setAttribute('role', 'status');
        const cancel = button('pi-bot-chip', translateUi("取消"));
        const save = el('button', 'pi-bot-primary pi-bot-sheet-save', creating ? translateUi("开始这个话题") : translateUi("保存")); save.type = 'submit';
        foot.append(status, cancel, save);
        form.append(head, body, foot); sheet.append(form); document.body.append(sheet);

        const values = () => ({ title: name.value, focus: focus.value, instructions: instructions.value, emoji: emoji.value, groupId: group.value });
        const edited = () => Object.entries(values()).some(([key, value]) => value !== base[key]);
        const say = (text, tone) => { status.textContent = text; if (tone) status.dataset.tone = tone; else delete status.dataset.tone; };
        const tooLong = () => bytes(cleanLines(instructions.value)) > INSTRUCTION_BYTES;
        function changes() {
            const next = Object.fromEntries(Object.entries(values()).map(([key, value]) => [key, tidy(key, value)]));
            if (!next.title || next.title.length > LIMITS.title || next.focus.length > LIMITS.focus || next.emoji.length > LIMITS.emoji || tooLong()) return null;
            if (creating) return { ...next, groupId: next.groupId || null };
            return Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== tidy(key, base[key])).map(([key, value]) => [key, key === 'groupId' ? value || null : value]));
        }
        const labels = () => {
            if (archive) archive.querySelector('span').textContent = archiveArmed ? translateUi("再点一次确认归档") : translateUi("归档");
            if (trash) trash.querySelector('span').textContent = trashArmed ? translateUi("再点一次移到回收站") : translateUi("移到回收站");
            archive?.classList.toggle('is-armed', archiveArmed); trash?.classList.toggle('is-armed', trashArmed);
        };
        function refresh() {
            const chosen = emoji.value.trim();
            face.replaceChildren(chosen ? el('span', 'pi-bot-topic-face-emoji', chosen) : icon('fa-face-smile'));
            face.classList.toggle('is-empty', !chosen);
            face.setAttribute('aria-label', chosen ? translateUi("更换图标（当前 {0}）", chosen) : translateUi("添加图标"));
            face.title = face.getAttribute('aria-label');
            focusCount.textContent = `${clean(focus.value).length}/${LIMITS.focus}`;
            const used = bytes(cleanLines(instructions.value));
            rulesCount.textContent = `${(used / 1024).toFixed(used ? 1 : 0)}/${INSTRUCTION_BYTES / 1024} KB`;
            rulesCount.dataset.over = String(used > INSTRUCTION_BYTES);
            const preview = cleanLines(instructions.value).split('\n')[0];
            rulesPreview.textContent = rules.open ? '' : preview || translateUi("未设置");
            const pending = changes();
            save.disabled = busy || gone || !pending || !Object.keys(pending).length;
            for (const control of form.querySelectorAll('input,textarea,select,.pi-bot-topic-emoji-panel button,.pi-bot-topic-face')) control.disabled = busy || gone;
            for (const choice of choices.children) choice.setAttribute('aria-pressed', String(choice.textContent === chosen));
            if (archive) archive.disabled = busy || gone;
            if (trash) trash.disabled = busy || gone;
        }
        const alive = () => sheet.open && dialog === sheet && options.current();
        const leave = action => {
            if (busy) return false;
            if (edited() && warned !== action) { warned = action; say(translateUi("还有修改没保存。再关一次就放弃这些修改。"), 'warn'); return false; }
            sheet.close(); return true;
        };
        close.addEventListener('click', () => leave('close'));
        cancel.addEventListener('click', () => leave('close'));
        sheet.addEventListener('cancel', event => { event.preventDefault(); if (!panel.hidden) { togglePanel(false); face.focus(); return; } leave('close'); });
        sheet.addEventListener('close', () => { sheet.remove(); if (dialog === sheet) dialog = null; });
        rules.addEventListener('toggle', refresh);
        form.addEventListener('input', event => {
            warned = null; archiveArmed = false; trashArmed = false; labels();
            const over = tooLong();
            instructions.setAttribute('aria-invalid', String(over));
            if (over) say(translateUi("话题指令太长了，最多 {0} KB（约 {1} 个汉字）。", INSTRUCTION_BYTES / 1024, 2700), 'error');
            else say('');
            if (event.target === instructions) fitTextarea(instructions);
            refresh();
        });

        async function reread() {
            const fresh = await options.latest();
            if (!alive()) return false;
            revision = fresh?.windowsRevision ?? revision;
            if (creating) { fillGroups(fresh, group.value); return true; }
            const now = fresh?.windows?.find(item => item.id === options.window.id);
            if (!now || now.trashedAt || !options.window.archivedAt && now.archivedAt) { gone = true; say(translateUi("这个话题已经被归档或移走了。"), 'error'); refresh(); return false; }
            fillGroups(fresh, group.value);
            const mine = values(), next = own(now), keepOpen = rules.open;
            fill(Object.fromEntries(Object.keys(next).map(key => [key, tidy(key, mine[key]) !== tidy(key, base[key]) ? mine[key] : next[key]])));
            rules.open = rules.open || keepOpen; base = next;
            return true;
        }
        async function request(path, method, payload, action, conflictText) {
            busy = true; refresh();
            try {
                const result = await options.api(path, { method, ...json({ expectedRevision: revision, ...payload }) });
                if (dialog === sheet) sheet.close();
                if (options.current()) await options.onSaved?.(result, action);
            } catch (error) {
                if (!alive()) return;
                archiveArmed = false; trashArmed = false; labels();
                if (stale(error)) {
                    let fresh = false;
                    try { fresh = await reread(); } catch {}
                    if (alive() && fresh) say(conflictText, 'warn');
                } else say(action === 'created' || action === 'edited' ? options.problem(error) : options.refusal(error), 'error');
            } finally { busy = false; if (sheet.open) refresh(); }
        }

        form.addEventListener('submit', event => {
            event.preventDefault();
            if (busy || gone) return;
            const pending = changes();
            if (!pending) { say(name.value.trim() ? translateUi("内容太长了") : translateUi("请给话题起个名字"), 'error'); name.focus(); return; }
            if (!creating && !Object.keys(pending).length) return;
            say(translateUi("正在保存…"));
            void request(url(options.profileId, creating ? null : options.window.id), creating ? 'POST' : 'PATCH', pending, creating ? 'created' : 'edited',
                translateUi("话题刚刚在别处改过。你的修改还在，检查后再保存一次。"));
        });
        archive?.addEventListener('click', () => {
            if (busy || gone) return;
            if (!archiveArmed) {
                archiveArmed = true; trashArmed = false; labels();
                say(edited() ? translateUi("还有修改没保存。再点一次就放弃这些修改并归档。") : translateUi("归档后话题从列表收起，记录都保留，可以在“已归档”里恢复。"), 'warn');
                return;
            }
            say(translateUi("正在归档…"));
            void request(url(options.profileId, options.window.id), 'PATCH', { archived: true }, 'archived', translateUi("话题刚刚在别处改过，还没有归档。检查后可以再归档一次。"));
        });
        trash?.addEventListener('click', () => {
            if (busy || gone) return;
            if (!trashArmed) {
                trashArmed = true; archiveArmed = false; labels();
                say(edited() ? translateUi("未保存的修改会放弃，完整聊天会保留在回收站，记事本中的事项不变。") : translateUi("完整聊天会保留在回收站，可以恢复。记事本中的事项不变。"), 'warn');
                return;
            }
            say(translateUi("正在移到回收站…"));
            void request(url(options.profileId, options.window.id) + '/trash', 'POST', {}, 'trashed', translateUi("话题刚刚在别处改过，请检查后重新确认。"));
        });
        refresh();
        sheet.showModal();
        fitTextarea(instructions);
        name.focus();
        return sheet;
    }

    window.PiBotTopicEditor = Object.freeze({ edit });
})();
