'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ProfileKnowledgeService } = require('../server/profile-memory/knowledge-service');
const { createKnowledgeMemoryTools } = require('../server/profile-memory/tool-mutations');
const compat = require('../server/ohmybuddy-compat');
const privateFiles = require('../server/pi-private-files');
const hash = value => createHash('sha256').update(value).digest('hex');
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function relocated(t, itemScope = 'profile', state = 'active') {
    const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'omb-skill-relocation-')));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const cwd = path.join(base, 'project');
    fs.mkdirSync(cwd);
    const projectKey = hash(cwd);
    const profiles = { getProfile: async key => key === id ? { id, enabled: true,
        memory: { enabled: false }, skills: { learnedEnabled: true } } : null };
    let serial = 0;
    function host(name) {
        const agent = path.join(base, name);
        fs.mkdirSync(agent);
        const root = path.join(compat.dataFile(agent, 'ohmybuddy-profiles'), 'data', id);
        const service = new ProfileKnowledgeService({ profiles, getAgentDir: async () => agent,
            bundlePath: process.env.PIVANE_TEST_HERMES_BUNDLE });
        const native = { cwd, sessionId: 'synthetic-migration', entryId: 'user-entry',
            sessionPath: path.join(agent, 'sessions', 'fixture', 'native.jsonl') };
        fs.mkdirSync(path.dirname(native.sessionPath), { recursive: true });
        fs.writeFileSync(native.sessionPath, [
            { type: 'session', id: native.sessionId, cwd, timestamp: '2026-01-01' },
            { type: 'custom', id: 'binding', parentId: null, customType: 'pivane-agent-profile',
                data: { version: 1, sessionId: native.sessionId, profileId: id } },
            { type: 'message', id: native.entryId, parentId: 'binding', message: { role: 'user', content: 'Synthetic fixture' } },
        ].map(row => JSON.stringify(row)).join('\n') + '\n');
        const context = { cwd, sessionManager: { getSessionFile: () => native.sessionPath,
            getSessionId: () => native.sessionId, getBranch: () => [{ id: native.entryId }] } };
        const fields = { scope: itemScope, ...(itemScope === 'project' ? { projectKey } : {}) };
        const mutate = async (operation, extra = {}) => service.mutateFromNative(id, {
            requestId: `relocation-${++serial}`, expectedRevision: (await service.snapshot(id)).revision,
            operation, kind: 'skill', ...fields, ...extra }, native);
        const tool = createKnowledgeMemoryTools(service, id);
        const run = args => tool('skill_manage', args, undefined, () => true, context);
        const file = path.join(itemScope === 'project' ? path.join(root, 'projects', projectKey) : root,
            'skills', 'relocated-skill', 'SKILL.md');
        return { service, agent, root, native, mutate, run, file, fields };
    }
    const old = host('old-host');
    const created = await old.mutate('create', { name: 'relocated-skill', description: 'Synthetic migration skill',
        content: '## Procedure\nOriginal procedure.', ...(state === 'draft' ? { state: 'draft' } : {}) });
    if (['disabled', 'deleted'].includes(state)) await old.mutate(state === 'deleted' ? 'delete' : 'disable', {
        itemId: created.item.id, itemRevision: created.item.revision });
    const current = host('new-host');
    fs.cpSync(old.root, current.root, { recursive: true });
    assert.notEqual(created.item.id, hash(current.file));
    const journalFile = compat.knowledgeFile(current.root, '.json');
    const journal = () => JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    return { ...current, old, created, journalFile, journal, itemScope };
}

for (const itemScope of ['profile', 'project']) test(`relocated ${itemScope} skill updates and patches through the native adapter with durable history`, async t => {
    const f = await relocated(t, itemScope);
    const original = fs.readFileSync(f.file, 'utf8');
    const skill_id = itemScope === 'profile' ? 'global:relocated-skill' : 'project:display-name:relocated-skill';
    const updated = await f.run({ action: 'update', skill_id, content: '## Procedure\nNew procedure.' });
    assert.equal(updated.details.success, true, JSON.stringify(updated.details));
    assert.equal(updated.details.receipt.itemId, f.created.item.id);
    assert.equal(updated.details.activation, 'reload-required');
    const patched = await f.run({ action: 'patch', skill_id, section: 'Procedure', content: 'Patched procedure.' });
    assert.equal(patched.details.success, true, JSON.stringify(patched.details));
    assert.match(fs.readFileSync(f.file, 'utf8'), /Patched procedure/);
    const undonePatch = await f.mutate('undo', { receiptId: patched.details.receipt.id });
    assert.match(fs.readFileSync(f.file, 'utf8'), /New procedure/);
    const undoneUpdate = await f.mutate('undo', { receiptId: updated.details.receipt.id });
    assert.equal(fs.readFileSync(f.file, 'utf8'), original);
    assert.equal(undoneUpdate.item.id, f.created.item.id);
    assert.equal(undonePatch.item.id, f.created.item.id);
    const removed = await f.run({ action: 'delete', skill_id });
    assert.equal(removed.details.success, true);
    assert.equal(fs.existsSync(f.file), false);
    await f.mutate('undo', { receiptId: removed.details.receipt.id });
    assert.equal(fs.readFileSync(f.file, 'utf8'), original);
    // A receipt created on the old host still resolves after relocation.
    await f.mutate('undo', { receiptId: f.created.receipt.id });
    assert.equal(fs.existsSync(f.file), false);
    const deleted = (await f.service.getItem(id, f.created.item.id)).item;
    await f.mutate('restore', { itemId: deleted.id, itemRevision: deleted.revision });
    assert.equal(fs.readFileSync(f.file, 'utf8'), original);
    assert.deepEqual(Object.keys(f.journal().records), [f.created.item.id]);
    assert.ok(f.journal().receipts.every(row => row.itemId === f.created.item.id));
});

for (const state of ['disabled', 'deleted', 'draft']) test(`relocated ${state} skills activate without replacing journal identities`, async t => {
    const f = await relocated(t, 'profile', state);
    const before = (await f.service.getItem(id, f.created.item.id)).item;
    await assert.rejects(f.mutate('create', { name: before.name, description: 'Duplicate', content: 'New steps.' }), /name already exists/);
    assert.equal(fs.existsSync(f.file), false);
    const result = await f.mutate(state === 'deleted' ? 'restore' : 'enable', { itemId: before.id, itemRevision: before.revision });
    assert.equal(result.item.id, before.id);
    assert.match(fs.readFileSync(f.file, 'utf8'), /Original procedure/);
    assert.equal(hash(fs.readFileSync(f.file)), result.item.revision);
    const disabled = await f.mutate('disable', { itemId: result.item.id, itemRevision: result.item.revision });
    await f.mutate('enable', { itemId: disabled.item.id, itemRevision: disabled.item.revision });
    assert.deepEqual(Object.keys(f.journal().records), [before.id]);
});

test('relocated active names, stale revisions, changed bytes, installed names and symlinks remain protected', async t => {
    const f = await relocated(t);
    const bytes = fs.readFileSync(f.file), journal = fs.readFileSync(f.journalFile);
    await assert.rejects(f.mutate('create', { name: 'relocated-skill', description: 'Duplicate', content: 'Another body.' }), /name already exists/);
    const fields = { itemId: f.created.item.id, itemRevision: '0'.repeat(64), name: 'relocated-skill',
        description: 'Synthetic migration skill', content: 'New body.' };
    await assert.rejects(f.mutate('update', fields), /revision changed/);
    fs.mkdirSync(path.join(f.agent, 'skills', 'relocated-skill'), { recursive: true });
    await assert.rejects(f.mutate('update', { ...fields, itemRevision: f.created.item.revision }), /Installed skill name/);
    fs.rmdirSync(path.join(f.agent, 'skills', 'relocated-skill'));
    assert.deepEqual(fs.readFileSync(f.journalFile), journal);
    fs.writeFileSync(f.file, 'External edit.');
    await assert.rejects(f.service.snapshot(id), /changed outside the service/);
    fs.writeFileSync(f.file, bytes);
    if (process.platform !== 'win32') {
        fs.renameSync(f.file, f.file + '.held');
        fs.symlinkSync(f.file + '.held', f.file);
        await assert.rejects(f.service.snapshot(id), /Unsafe profile file/);
        fs.unlinkSync(f.file); fs.renameSync(f.file + '.held', f.file);
    }
    assert.deepEqual(fs.readFileSync(f.file), bytes);
    assert.deepEqual(fs.readFileSync(f.journalFile), journal);
    assert.equal(fs.existsSync(compat.knowledgeFile(f.root, '.pending')), false);
});

test('two journal IDs cannot claim the same relocated skill', async t => {
    const f = await relocated(t);
    const data = f.journal(), second = 'f'.repeat(64);
    data.records[second] = { ...data.records[f.created.item.id], id: second };
    fs.writeFileSync(f.journalFile, JSON.stringify(data));
    await assert.rejects(f.service.snapshot(id), /Ambiguous managed skill identity/);
});

test('relocation never binds a frontmatter name to another skill directory', async t => {
    const f = await relocated(t);
    fs.renameSync(path.dirname(f.file), path.join(path.dirname(path.dirname(f.file)), 'other-folder'));
    await assert.rejects(f.service.snapshot(id), /changed outside the service/);
    assert.equal(fs.existsSync(f.file), false);
});

test('relocated skill publication repairs metadata once using the same request and original ID', async t => {
    const f = await relocated(t);
    const input = { requestId: 'relocation-repair', expectedRevision: (await f.service.snapshot(id)).revision,
        operation: 'update', kind: 'skill', itemId: f.created.item.id, itemRevision: f.created.item.revision,
        name: 'relocated-skill', description: 'Synthetic migration skill', content: 'Published exactly once.' };
    const original = privateFiles.writePrivateFileSync;
    privateFiles.writePrivateFileSync = (file, ...args) => {
        if (file.startsWith(f.journalFile + '.')) throw new Error('Synthetic journal failure');
        return original(file, ...args);
    };
    try { await assert.rejects(f.service.mutate(id, input), /Synthetic journal failure/); }
    finally { privateFiles.writePrivateFileSync = original; }
    assert.equal((await f.service.snapshot(id)).status, 'pending');
    const published = fs.statSync(f.file, { bigint: true });
    const saved = await f.service.mutate(id, input);
    assert.equal(saved.receipt.itemId, f.created.item.id);
    assert.equal(fs.statSync(f.file, { bigint: true }).mtimeNs, published.mtimeNs);
    assert.equal((await f.service.mutate(id, input)).receipt.id, saved.receipt.id);
    assert.deepEqual(Object.keys(f.journal().records), [f.created.item.id]);
});
