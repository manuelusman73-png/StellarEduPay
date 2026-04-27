#!/usr/bin/env node
'use strict';

/**
 * Migration: migrate-payment-index
 *
 * Replaces the single-field unique index on txHash with a compound unique
 * index on { schoolId, txHash }, enabling per-school uniqueness enforcement
 * and faster school-scoped payment queries.
 *
 * Safe to re-run — drops the old index only if it exists, then creates the
 * new one with createIndex (no-op if it already exists).
 *
 * Usage:
 *   MONGO_URI=mongodb://... node scripts/migrate-payment-index.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI is required');
  process.exit(1);
}

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log('Connected to MongoDB');

  const db = client.db();
  const col = db.collection('payments');

  // Drop the old single-field unique index on txHash if it exists
  const indexes = await col.indexes();
  const oldIndex = indexes.find(
    idx => idx.unique && idx.key && idx.key.txHash === 1 && !idx.key.schoolId
  );
  if (oldIndex) {
    await col.dropIndex(oldIndex.name);
    console.log(`Dropped old index: ${oldIndex.name}`);
  } else {
    console.log('Old single-field txHash unique index not found — skipping drop');
  }

  // Create the new compound unique index
  await col.createIndex({ schoolId: 1, txHash: 1 }, { unique: true, background: true });
  console.log('Created compound unique index { schoolId: 1, txHash: 1 }');

  await client.close();
  console.log('Migration complete.');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
