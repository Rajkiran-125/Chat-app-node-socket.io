const ApiError = require('../utils/api-error');
const roomRepository = require('../repositories/room.repository');
const userRepository = require('../repositories/user.repository');

/** Find or create the DM room between me and another user. */
async function openDm(currentUserId, otherUserId) {
  if (!otherUserId || typeof otherUserId !== 'string') {
    throw ApiError.badRequest('userId is required');
  }
  if (otherUserId === currentUserId) {
    throw ApiError.badRequest('Cannot open a chat with yourself');
  }
  if (!(await userRepository.findById(otherUserId))) {
    throw ApiError.notFound('User not found');
  }
  return roomRepository.createDm(currentUserId, otherUserId);
}

/** Throws unless the user is a member of the room. */
async function assertMembership(roomId, userId) {
  const room = await roomRepository.findById(roomId);
  if (!room) throw ApiError.notFound('Room not found');
  if (!room.memberIds.includes(userId)) {
    throw ApiError.forbidden('You are not a member of this room');
  }
  return room;
}

/** The other participant of a DM room. */
function otherMemberId(room, userId) {
  return room.memberIds.find((id) => id !== userId);
}

module.exports = { openDm, assertMembership, otherMemberId };
