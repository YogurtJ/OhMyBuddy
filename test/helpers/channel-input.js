'use strict';
const { createHash } = require('node:crypto');
const { registerChannelTurns, MESSAGE } = require('../../server/channels/runtime');

// Exercise the production native channel writer with an isolated SessionManager.
function appendChannelInput(manager, text, { images = [], peerId = 'synthetic-owner' } = {}) {
    const handlers = new Map();
    const pi = { on: (event, handler) => handlers.set(event, handler),
        appendEntry: (name, data) => manager.appendCustomEntry(name, data),
        sendMessage: value => manager.appendCustomMessageEntry(value.customType, value.content, value.display, value.details) };
    const context = { sessionManager: manager, isIdle: () => true, hasPendingMessages: () => false, model: { input: ['text', 'image'] } };
    const messageId = createHash('sha256').update(`${manager.getSessionId()}:${manager.getLeafId()}:${text}`).digest('hex');
    registerChannelTurns(pi)(context, { action: 'start', id: messageId, sessionId: manager.getSessionId(), peerId, text, images });
    const entry = manager.getBranch().findLast(item => item.type === 'custom_message' && item.customType === MESSAGE);
    return { entry, messageId, finish: () => handlers.get('agent_settled')({ aborted: false }, context) };
}
module.exports = { appendChannelInput };
