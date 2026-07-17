const config = require('../config');
const { validateMessagePayload } = require('../utils/validators');
const messageRepository = require('../repositories/message.repository');
const roomService = require('./room.service');

/**
 * Validate + persist a message. Always created as 'sent'; it becomes
 * 'delivered' only when the recipient's client actually acknowledges receipt
 * (message:delivered) or on their reconnect sweep — never optimistically from
 * presence, which could mark a message delivered that the client never got.
 */
function createMessage({ roomId, sender, type, content, clientId }) {
  const room = roomService.assertMembership(roomId, sender.id);
  const clean = validateMessagePayload({ type, content });
  const recipientId = roomService.otherMemberId(room, sender.id);

  // Idempotency: a retried send (same clientId after a lost ack) returns the
  // already-stored message instead of creating a duplicate.
  if (clientId) {
    const existing = messageRepository.findByClientId(roomId, sender.id, clientId);
    if (existing) return { message: existing, recipientId, duplicate: true };
  }

  const message = messageRepository.create({
    roomId,
    senderId: sender.id,
    senderName: sender.userName,
    type: clean.type,
    content: clean.content,
    status: 'sent',
    clientId: clientId || null
  });
  return { message, recipientId, duplicate: false };
}

function history(roomId, userId, { before, limit }) {
  roomService.assertMembership(roomId, userId);
  const pageSize = Math.min(
    Math.max(parseInt(limit, 10) || 50, 1),
    config.limits.historyPageMax
  );
  return messageRepository.listByRoom(roomId, { before, limit: pageSize });
}

module.exports = { createMessage, history };
