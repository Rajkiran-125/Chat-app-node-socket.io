const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { createStore } = require('../store/json-store');

// { byRoom: { [roomId]: Message[] } } - each room's messages ordered by createdAt.
const store = createStore(path.join(config.dataDir, 'messages.json'), { byRoom: {} });

function roomMessages(roomId) {
  if (!store.data.byRoom[roomId]) store.data.byRoom[roomId] = [];
  return store.data.byRoom[roomId];
}

function create({ roomId, senderId, senderName, type, content, status, clientId }) {
  const message = {
    id: crypto.randomUUID(),
    roomId,
    senderId,
    senderName,
    type,
    content,
    status: status || 'sent', // sent -> delivered -> read
    clientId: clientId || null,
    createdAt: new Date().toISOString()
  };
  roomMessages(roomId).push(message);
  store.save();
  return message;
}

/** Idempotency lookup: has this sender already stored a message with this clientId? */
function findByClientId(roomId, senderId, clientId) {
  if (!clientId) return null;
  return (
    (store.data.byRoom[roomId] || []).find(
      (m) => m.clientId === clientId && m.senderId === senderId
    ) || null
  );
}

/**
 * Page backwards through history: newest page first.
 * `before` is a message id - returns messages strictly older than it.
 */
function listByRoom(roomId, { before, limit }) {
  const messages = roomMessages(roomId);
  let end = messages.length;
  if (before) {
    const idx = messages.findIndex((m) => m.id === before);
    // Unknown cursor: return an empty page rather than silently restarting at
    // the newest messages (which would duplicate content the client already has).
    if (idx === -1) return { messages: [], hasMore: false };
    end = idx;
  }
  const start = Math.max(0, end - limit);
  return {
    messages: messages.slice(start, end),
    hasMore: start > 0
  };
}

function lastMessage(roomId) {
  const messages = store.data.byRoom[roomId] || [];
  return messages.length ? messages[messages.length - 1] : null;
}

/** Messages sent TO userId (i.e. not by them) that they have not read yet. */
function unreadCount(roomId, userId) {
  const messages = store.data.byRoom[roomId] || [];
  return messages.filter((m) => m.senderId !== userId && m.status !== 'read').length;
}

/** Mark all 'sent' messages addressed to recipientId as delivered. Returns affected ids. */
function markDeliveredForRecipient(roomId, recipientId) {
  const affected = [];
  roomMessages(roomId).forEach((m) => {
    if (m.senderId !== recipientId && m.status === 'sent') {
      m.status = 'delivered';
      affected.push(m.id);
    }
  });
  if (affected.length) store.save();
  return affected;
}

/**
 * Mark one message delivered, but only if the caller is its recipient
 * (i.e. not its sender) and it is still 'sent'. Returns the message's senderId
 * when a change was made, otherwise null — so the caller can notify the right
 * sender rather than blindly the other room member.
 */
function markMessageDelivered(roomId, messageId, recipientId) {
  const message = roomMessages(roomId).find((m) => m.id === messageId);
  if (message && message.senderId !== recipientId && message.status === 'sent') {
    message.status = 'delivered';
    store.save();
    return message.senderId;
  }
  return null;
}

/** Mark all messages addressed to readerId as read. Returns affected ids. */
function markReadForRecipient(roomId, readerId) {
  const affected = [];
  roomMessages(roomId).forEach((m) => {
    if (m.senderId !== readerId && m.status !== 'read') {
      m.status = 'read';
      affected.push(m.id);
    }
  });
  if (affected.length) store.save();
  return affected;
}

module.exports = {
  create,
  findByClientId,
  listByRoom,
  lastMessage,
  unreadCount,
  markDeliveredForRecipient,
  markMessageDelivered,
  markReadForRecipient
};
