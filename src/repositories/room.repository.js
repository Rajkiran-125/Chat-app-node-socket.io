const path = require('path');
const config = require('../config');
const { createStore } = require('../store/json-store');

const store = createStore(path.join(config.dataDir, 'rooms.json'), { rooms: [] });

/** Deterministic DM room id so the same pair can never get two rooms. */
function dmRoomId(userIdA, userIdB) {
  return `dm_${[userIdA, userIdB].sort().join('_')}`;
}

function findById(id) {
  return store.data.rooms.find((r) => r.id === id) || null;
}

function findDm(userIdA, userIdB) {
  return findById(dmRoomId(userIdA, userIdB));
}

function listForUser(userId) {
  return store.data.rooms.filter((r) => r.memberIds.includes(userId));
}

function createDm(userIdA, userIdB) {
  const existing = findDm(userIdA, userIdB);
  if (existing) return existing;
  const room = {
    id: dmRoomId(userIdA, userIdB),
    memberIds: [userIdA, userIdB],
    createdAt: new Date().toISOString()
  };
  store.data.rooms.push(room);
  store.save();
  return room;
}

function isMember(roomId, userId) {
  const room = findById(roomId);
  return !!room && room.memberIds.includes(userId);
}

module.exports = { findById, findDm, listForUser, createDm, isMember, dmRoomId };
