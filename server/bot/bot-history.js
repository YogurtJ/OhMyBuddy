'use strict';
// Read-only history of a Bot window's earlier generations. Each generation is opened from
// its verified native file (no worker), proven to belong to this window by its marker, and
// paged with the same projection the live archive uses (whole branch).
const { historyArchive, validateArchiveRequest } = require('../pi-history-archive');
const { readWindowBinding } = require('./bot-window-state');

const fail = (message, status = 400, code) => { throw Object.assign(new Error(message), { status, ...(code ? { code } : {}) }); };
const integer = value => {
    if (value === undefined || value === '') return undefined;
    const number = typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : value;
    return Number.isSafeInteger(number) && number >= 0 ? number : NaN;
};

// Query-string or JSON input → a validated archive request plus the generation number.
function historyRequest(query = {}) {
    const generation = integer(query.generation);
    if (!Number.isSafeInteger(generation)) fail('Invalid generation');
    const input = { view: query.view ?? 'index' };
    for (const key of ['offset', 'start', 'end', 'index']) {
        const value = integer(query[key]);
        if (Number.isNaN(value)) fail('Invalid history position');
        if (value !== undefined) input[key] = value;
    }
    if (query.revision !== undefined) input.revision = query.revision;
    try { return { generation, input: validateArchiveRequest(input) }; }
    catch (error) { fail(error.message, 400, error.code); }
}

// Public timeline of a window: earlier generations in order, without paths or session IDs.
function generationList(window) {
    return window.generations.map(item => ({ generation: item.generation, startedAt: item.startedAt, endedAt: item.endedAt, reason: item.reason,
        current: item.generation === window.current?.generation }));
}

async function generationHistory({ store, profileId, window, generation, input }) {
    const record = window.generations.find(item => item.generation === generation);
    if (!record) fail('Generation not found', 404);
    if (record.generation === window.current?.generation) fail('The current conversation is read through its live view', 409);
    return store.withSessionRead(window.cwd, record.sessionId, (session, read) => {
        const manager = read.manager(), binding = readWindowBinding(manager);
        read.validate();
        if (session.path !== record.sessionPath || binding?.profileId !== profileId || binding.windowId !== window.id
            || binding.generation !== generation) fail('Earlier conversation does not match this window', 409);
        let result;
        try { result = historyArchive(manager, input, { whole: true }); }
        catch (error) { fail(error.message, error.code === 'HISTORY_STALE' ? 409 : 400, error.code); }
        read.validate();
        return { generation, startedAt: record.startedAt, endedAt: record.endedAt, ...result };
    });
}

module.exports = { historyRequest, generationList, generationHistory };
