const crypto = require('crypto');
const { collection, strip } = require('../store/mongo-store');

const users = () => collection('users');

async function all() {
  const docs = await users().find({}).toArray();
  return docs.map(strip);
}

async function findById(id) {
  return strip(await users().findOne({ id }));
}

async function findByPhone(phone) {
  return strip(await users().findOne({ phone }));
}

async function create({ userName, phone, avatar }) {
  const user = {
    id: crypto.randomUUID(),
    userName,
    phone,
    avatar,
    createdAt: new Date().toISOString(),
    lastSeenAt: null
  };
  await users().insertOne(user);
  return strip(user);
}

async function setLastSeen(id, isoDate) {
  await users().updateOne({ id }, { $set: { lastSeenAt: isoDate } });
  return findById(id);
}

module.exports = { all, findById, findByPhone, create, setLastSeen };
