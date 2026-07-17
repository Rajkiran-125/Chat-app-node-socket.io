/**
 * One-time migration: import the legacy JSON-file data (data/*.json) into MongoDB.
 *
 * Usage (run locally, with MONGODB_URI pointing at your Atlas cluster):
 *   MONGODB_URI="mongodb+srv://..." npm run migrate
 *
 * Idempotent: every document is upserted on its `id`, so re-running is safe and
 * will not create duplicates. Reads are tolerant of missing files (treated as
 * empty), so it also works on a fresh checkout with no data.
 */
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const mongoStore = require('../src/store/mongo-store');

const DATA_DIR = config.dataDir;

function readJson(file, fallback) {
  const full = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(full)) {
      console.log(`  (${file} not found — skipping)`);
      return fallback;
    }
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    console.error(`  Failed to read ${file}: ${err.message}`);
    return fallback;
  }
}

/** Upsert every doc on its `id`; returns the number processed. */
async function upsertAll(collectionName, docs) {
  if (!docs.length) return 0;
  const ops = docs.map((doc) => ({
    updateOne: { filter: { id: doc.id }, update: { $set: doc }, upsert: true }
  }));
  await mongoStore.collection(collectionName).bulkWrite(ops, { ordered: false });
  return docs.length;
}

async function main() {
  if (!config.mongoUri) {
    console.error('MONGODB_URI is not set. Aborting.');
    process.exit(1);
  }

  console.log(`Reading legacy JSON from: ${DATA_DIR}`);
  const users = readJson('users.json', { users: [] }).users || [];
  const rooms = readJson('rooms.json', { rooms: [] }).rooms || [];
  const byRoom = readJson('messages.json', { byRoom: {} }).byRoom || {};

  // Flatten { byRoom: { roomId: Message[] } } into one array, normalizing the
  // clientId default so older records (pre-idempotency) match the current shape.
  const messages = Object.values(byRoom)
    .flat()
    .map((m) => ({ clientId: null, ...m }));

  await mongoStore.connect();

  const nUsers = await upsertAll('users', users);
  const nRooms = await upsertAll('rooms', rooms);
  const nMessages = await upsertAll('messages', messages);

  console.log('\nMigration complete:');
  console.log(`  users:    ${nUsers}`);
  console.log(`  rooms:    ${nRooms}`);
  console.log(`  messages: ${nMessages}`);

  await mongoStore.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(`Migration failed: ${err.message}`);
  await mongoStore.close().catch(() => {});
  process.exit(1);
});
