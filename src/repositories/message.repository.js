const crypto = require('crypto');
const { collection, strip } = require('../store/mongo-store');

// Each message is one document: { id, roomId, senderId, senderName, type,
// content, status, clientId, createdAt }. Ordering within a room is by
// (createdAt, id) — id (a UUID) is a stable tiebreaker when two messages share
// an ISO-millisecond timestamp.
const messages = () => collection('messages');

async function create({ roomId, senderId, senderName, type, content, status, clientId }) {
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
  await messages().insertOne(message);
  return strip(message);
}

/** Idempotency lookup: has this sender already stored a message with this clientId? */
async function findByClientId(roomId, senderId, clientId) {
  if (!clientId) return null;
  return strip(await messages().findOne({ roomId, senderId, clientId }));
}

/**
 * Page backwards through history: newest page first.
 * `before` is a message id - returns messages strictly older than it.
 */
async function listByRoom(roomId, { before, limit }) {
  const filter = { roomId };

  if (before) {
    const cursor = await messages().findOne(
      { roomId, id: before },
      { projection: { createdAt: 1, id: 1 } }
    );
    // Unknown cursor: return an empty page rather than silently restarting at
    // the newest messages (which would duplicate content the client already has).
    if (!cursor) return { messages: [], hasMore: false };
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { $lt: cursor.id } }
    ];
  }

  // Fetch newest-of-the-older-set first; grab one extra to detect hasMore.
  const docs = await messages()
    .find(filter)
    .sort({ createdAt: -1, id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit).reverse(); // return in ascending order
  return { messages: page.map(strip), hasMore };
}

async function lastMessage(roomId) {
  const doc = await messages()
    .find({ roomId })
    .sort({ createdAt: -1, id: -1 })
    .limit(1)
    .next();
  return strip(doc);
}

/** Messages sent TO userId (i.e. not by them) that they have not read yet. */
async function unreadCount(roomId, userId) {
  return messages().countDocuments({
    roomId,
    senderId: { $ne: userId },
    status: { $ne: 'read' }
  });
}

/** Mark all 'sent' messages addressed to recipientId as delivered. Returns affected ids. */
async function markDeliveredForRecipient(roomId, recipientId) {
  const filter = { roomId, senderId: { $ne: recipientId }, status: 'sent' };
  const affected = (
    await messages().find(filter, { projection: { id: 1 } }).toArray()
  ).map((m) => m.id);
  if (affected.length) {
    await messages().updateMany(filter, { $set: { status: 'delivered' } });
  }
  return affected;
}

/**
 * Mark one message delivered, but only if the caller is its recipient
 * (i.e. not its sender) and it is still 'sent'. Returns the message's senderId
 * when a change was made, otherwise null — so the caller can notify the right
 * sender rather than blindly the other room member.
 */
async function markMessageDelivered(roomId, messageId, recipientId) {
  const result = await messages().findOneAndUpdate(
    { id: messageId, roomId, senderId: { $ne: recipientId }, status: 'sent' },
    { $set: { status: 'delivered' } },
    { returnDocument: 'after' }
  );
  const doc = result && result.value !== undefined ? result.value : result;
  return doc ? doc.senderId : null;
}

/** Mark all messages addressed to readerId as read. Returns affected ids. */
async function markReadForRecipient(roomId, readerId) {
  const filter = { roomId, senderId: { $ne: readerId }, status: { $ne: 'read' } };
  const affected = (
    await messages().find(filter, { projection: { id: 1 } }).toArray()
  ).map((m) => m.id);
  if (affected.length) {
    await messages().updateMany(filter, { $set: { status: 'read' } });
  }
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
