const { MongoClient } = require('mongodb');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * MongoDB persistence layer used by the repositories.
 *
 * A single MongoClient/connection pool is created once at startup via connect()
 * and reused for the process lifetime. Repositories access collections through
 * collection(name); they never touch the driver directly, so the rest of the
 * app stays database-agnostic (this replaces the old json-store).
 *
 * Business identity is our own UUID `id` field, NOT Mongo's `_id`. We keep `_id`
 * out of returned objects (strip() below) so API/socket payloads are unchanged
 * from the JSON-file era.
 */

let client = null;
let db = null;

/** Connect once, cache the db, ensure indexes. Idempotent. */
async function connect() {
  if (db) return db;
  if (!config.mongoUri) {
    throw new Error('MONGODB_URI is not set — cannot connect to the database');
  }
  client = new MongoClient(config.mongoUri, {
    serverSelectionTimeoutMS: 10000
  });
  await client.connect();
  db = client.db(config.mongoDbName);
  await ensureIndexes();
  logger.info(`Connected to MongoDB (db: ${config.mongoDbName})`);
  return db;
}

function collection(name) {
  if (!db) throw new Error('MongoDB not connected — call connect() first');
  return db.collection(name);
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

/** Strip Mongo's internal _id so returned docs match the original JSON shape. */
function strip(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

async function ensureIndexes() {
  await Promise.all([
    db.collection('users').createIndex({ id: 1 }, { unique: true }),
    db.collection('users').createIndex({ phone: 1 }, { unique: true }),
    db.collection('rooms').createIndex({ id: 1 }, { unique: true }),
    db.collection('rooms').createIndex({ memberIds: 1 }),
    db.collection('messages').createIndex({ id: 1 }, { unique: true }),
    // Pagination + lastMessage: newest-first within a room, id as tiebreaker.
    db.collection('messages').createIndex({ roomId: 1, createdAt: 1, id: 1 }),
    // Idempotency lookup for retried sends.
    db.collection('messages').createIndex({ roomId: 1, senderId: 1, clientId: 1 })
  ]);
}

module.exports = { connect, collection, close, strip };
