const { collection, strip } = require('../store/mongo-store');

const rooms = () => collection('rooms');

/** Deterministic DM room id so the same pair can never get two rooms. */
function dmRoomId(userIdA, userIdB) {
  return `dm_${[userIdA, userIdB].sort().join('_')}`;
}

async function findById(id) {
  return strip(await rooms().findOne({ id }));
}

async function findDm(userIdA, userIdB) {
  return findById(dmRoomId(userIdA, userIdB));
}

async function listForUser(userId) {
  const docs = await rooms().find({ memberIds: userId }).toArray();
  return docs.map(strip);
}

/**
 * Find or create the DM room. Upsert on the deterministic id makes this
 * race-safe: two concurrent opens converge on the same single room.
 */
async function createDm(userIdA, userIdB) {
  const id = dmRoomId(userIdA, userIdB);
  const result = await rooms().findOneAndUpdate(
    { id },
    {
      $setOnInsert: {
        id,
        memberIds: [userIdA, userIdB],
        createdAt: new Date().toISOString()
      }
    },
    { upsert: true, returnDocument: 'after' }
  );
  // Driver v6 returns the document directly; older shapes nest it under .value.
  return strip(result && result.value ? result.value : result);
}

async function isMember(roomId, userId) {
  const room = await findById(roomId);
  return !!room && room.memberIds.includes(userId);
}

module.exports = { findById, findDm, listForUser, createDm, isMember, dmRoomId };
