'use strict';

/**
 * Migration 008 — Ensure unique index on schools.slug
 *
 * schoolModel.js declares slug with unique:true inline, but Mongoose only
 * creates schema indexes on new collections. This migration applies the
 * unique index to existing collections and drops any non-unique slug index
 * that may already exist.
 */

const mongoose = require('mongoose');

const VERSION = '008_add_school_slug_unique_index';

async function up() {
  const collection = mongoose.connection.collection('schools');

  // Drop any existing non-unique index on slug before creating the unique one
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.key && idx.key.slug !== undefined && !idx.unique) {
      await collection.dropIndex(idx.name);
      console.log(`[008] Dropped non-unique slug index: ${idx.name}`);
    }
  }

  await collection.createIndex({ slug: 1 }, { unique: true, background: true });
  console.log('[008] Created unique index on schools.slug');
}

async function down() {
  const collection = mongoose.connection.collection('schools');
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.key && idx.key.slug !== undefined && idx.unique) {
      await collection.dropIndex(idx.name);
      console.log(`[008] Dropped unique slug index: ${idx.name}`);
    }
  }
}

module.exports = { version: VERSION, up, down };
