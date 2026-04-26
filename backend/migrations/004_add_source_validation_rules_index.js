'use strict';

/**
 * Migration: Add unique index on sourcevalidationrules.name
 *
 * The sourceValidationRuleModel schema declares a unique index on `name`.
 * Mongoose only creates schema indexes on new collections; this migration
 * ensures the index exists on collections created before the model was wired up.
 */

const VERSION = '004_add_source_validation_rules_index';

async function up(db) {
  const collection = db.collection('sourcevalidationrules');
  await collection.createIndex({ name: 1 }, { unique: true });
  console.log('[004] Created unique index on sourcevalidationrules.name');
}

async function down(db) {
  const collection = db.collection('sourcevalidationrules');
  try {
    await collection.dropIndex('name_1');
    console.log('[004] Dropped unique index on sourcevalidationrules.name');
  } catch (err) {
    // Index may not exist if migration was never applied
    if (err.codeName !== 'IndexNotFound') throw err;
  }
}

module.exports = { version: VERSION, up, down };
