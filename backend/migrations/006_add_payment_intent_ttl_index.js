'use strict';

/**
 * Migration 006 — Add TTL index on paymentintents.createdAt
 *
 * paymentIntentModel.js now declares a TTL index on createdAt so MongoDB
 * automatically removes stale intents. Mongoose only creates schema indexes
 * on new collections; this migration applies the index to existing ones.
 *
 * TTL is read from PAYMENT_INTENT_TTL_SECONDS (default: 86400 = 24 hours).
 */

const mongoose = require('mongoose');

const VERSION = '006_add_payment_intent_ttl_index';
const TTL_SECONDS = parseInt(process.env.PAYMENT_INTENT_TTL_SECONDS || '86400', 10);

async function up() {
  const collection = mongoose.connection.collection('paymentintents');

  // Drop any existing TTL index on createdAt before (re)creating with the
  // correct expireAfterSeconds value.
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.key && idx.key.createdAt !== undefined && idx.expireAfterSeconds !== undefined) {
      await collection.dropIndex(idx.name);
      console.log(`[006] Dropped existing TTL index: ${idx.name}`);
    }
  }

  await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: TTL_SECONDS });
  console.log(`[006] Created TTL index on paymentintents.createdAt (${TTL_SECONDS}s)`);
}

async function down() {
  const collection = mongoose.connection.collection('paymentintents');
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.key && idx.key.createdAt !== undefined && idx.expireAfterSeconds !== undefined) {
      await collection.dropIndex(idx.name);
      console.log(`[006] Dropped TTL index: ${idx.name}`);
    }
  }
}

module.exports = { version: VERSION, up, down };
