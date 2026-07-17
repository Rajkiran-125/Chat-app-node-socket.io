const userRepository = require('../repositories/user.repository');
const roomRepository = require('../repositories/room.repository');
const messageRepository = require('../repositories/message.repository');
const presenceService = require('./presence.service');
const { toPublicProfile } = require('./auth.service');

/**
 * Everything the sidebar needs in one call: every other user plus their
 * DM room with me (if any), its last message and my unread count.
 */
function sidebarList(currentUserId) {
  return userRepository
    .all()
    .filter((u) => u.id !== currentUserId)
    .map((u) => {
      const room = roomRepository.findDm(currentUserId, u.id);
      return {
        ...toPublicProfile(u),
        online: presenceService.isOnline(u.id),
        roomId: room ? room.id : null,
        lastMessage: room ? messageRepository.lastMessage(room.id) : null,
        unreadCount: room ? messageRepository.unreadCount(room.id, currentUserId) : 0
      };
    })
    .sort((a, b) => {
      const timeA = a.lastMessage ? a.lastMessage.createdAt : a.createdAt;
      const timeB = b.lastMessage ? b.lastMessage.createdAt : b.createdAt;
      return timeB.localeCompare(timeA);
    });
}

module.exports = { sidebarList };
