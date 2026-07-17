const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { createStore } = require('../store/json-store');

const store = createStore(path.join(config.dataDir, 'users.json'), { users: [] });

function all() {
  return store.data.users;
}

function findById(id) {
  return store.data.users.find((u) => u.id === id) || null;
}

function findByPhone(phone) {
  return store.data.users.find((u) => u.phone === phone) || null;
}

function create({ userName, phone, avatar }) {
  const user = {
    id: crypto.randomUUID(),
    userName,
    phone,
    avatar,
    createdAt: new Date().toISOString(),
    lastSeenAt: null
  };
  store.data.users.push(user);
  store.save();
  return user;
}

function setLastSeen(id, isoDate) {
  const user = findById(id);
  if (user) {
    user.lastSeenAt = isoDate;
    store.save();
  }
  return user;
}

module.exports = { all, findById, findByPhone, create, setLastSeen };
