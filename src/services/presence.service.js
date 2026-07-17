const userRepository = require('../repositories/user.repository');

// userId -> Set<socketId>. A user is online while they have >= 1 live socket.
const sockets = new Map();

/** Returns true when this is the user's FIRST live socket (came online). */
function addSocket(userId, socketId) {
  let set = sockets.get(userId);
  if (!set) {
    set = new Set();
    sockets.set(userId, set);
  }
  set.add(socketId);
  return set.size === 1;
}

/** Returns true when this was the user's LAST live socket (went offline). */
function removeSocket(userId, socketId) {
  const set = sockets.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    sockets.delete(userId);
    userRepository.setLastSeen(userId, new Date().toISOString());
    return true;
  }
  return false;
}

function isOnline(userId) {
  return sockets.has(userId);
}

function onlineUserIds() {
  return [...sockets.keys()];
}

function onlineCount() {
  return sockets.size;
}

module.exports = { addSocket, removeSocket, isOnline, onlineUserIds, onlineCount };
