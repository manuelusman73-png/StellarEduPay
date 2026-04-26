'use strict';

/**
 * Migration: Add TTL index to idempotencykeys collection
 *
 * Ensures existing collections get the TTL index that the updated
 * idempotencyKeyModel.js schema now declares via `expires`.
 * Mongoose only creates schema indexes on new collections; this migration
 * handles collections that existed before the model change.
 *
 * TTL is read from IDEMPOTENCY_KEY_TTL_SECONDS (default: 86400 = 24 hours).
 */

const mongoose = require('mongoose');

const VERSION = '003_add_idempotency_key_ttl_index';
const TTL_SECONDS = parseInt(process.env.IDEMPOTENCY_KEY_TTL_SECONDS || '86400', 10);

async function up() {
  const collection = mongoose.connection.collection('idempotencykeys');

  // Drop any existing TTL index on createdAt so we can (re)create it with
  // the correct expireAfterSeconds value.
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.key && idx.key.createdAt !== undefined && idx.expireAfterSeconds !== undefined) {
      await collection.dropIndex(idx.name);
      console.log(`[003] Dropped existing TTL index: ${idx.name}`);
    }
  }

  await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: TTL_SECONDS });
  console.log(`[003] Created TTL index on idempotencykeys.createdAt (${TTL_SECONDS}s)`);
}

async function down() {
  const collection = mongoose.connection.collection('idempotencykeys');
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.key && idx.key.createdAt !== undefined && idx.expireAfterSeconds !== undefined) {
      await collection.dropIndex(idx.name);
      console.log(`[003] Dropped TTL index: ${idx.name}`);
    }
  }
}

module.exports = { version: VERSION, up, down };
