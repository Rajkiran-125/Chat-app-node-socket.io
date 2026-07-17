const userRepository = require('../repositories/user.repository');
const roomRepository = require('../repositories/room.repository');
const messageRepository = require('../repositories/message.repository');
const presenceService = require('./presence.service');
const { toPublicProfile } = require('./auth.service');

/**
 * Everything the sidebar needs in one call: every other user plus their
 * DM room with me (if any), its last message and my unread count.
 */
async function sidebarList(currentUserId) {
  const users = await userRepository.all();
  const others = users.filter((u) => u.id !== currentUserId);

  const entries = await Promise.all(
    others.map(async (u) => {
      const room = await roomRepository.findDm(currentUserId, u.id);
      const [lastMessage, unreadCount] = room
        ? await Promise.all([
            messageRepository.lastMessage(room.id),
            messageRepository.unreadCount(room.id, currentUserId)
          ])
        : [null, 0];
      return {
        ...toPublicProfile(u),
        online: presenceService.isOnline(u.id),
        roomId: room ? room.id : null,
        lastMessage,
        unreadCount
      };
    })
  );

  return entries.sort((a, b) => {
    const timeA = a.lastMessage ? a.lastMessage.createdAt : a.createdAt;
    const timeB = b.lastMessage ? b.lastMessage.createdAt : b.createdAt;
    return timeB.localeCompare(timeA);
  });
}

module.exports = { sidebarList };
