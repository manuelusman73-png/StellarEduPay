'use strict';

/**
 * Migration 015 — Add webhookSecret field to existing School documents
 *
 * If webhookSecret was added to the School model after initial deployment,
 * existing school documents will not have this field. This migration generates
 * a cryptographically secure random secret for each school that does not already
 * have one.
 *
 * The migration is idempotent — running it twice does not overwrite existing secrets.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');

const VERSION = '015_add_school_webhook_secret';

async function up() {
  const collection = mongoose.connection.collection('schools');

  // Find all schools without a webhookSecret field
  const schools = await collection.find({ webhookSecret: { $exists: false } }).toArray();

  if (schools.length === 0) {
    console.log('[Migration 015] No schools without webhookSecret found. Skipping.');
    return;
  }

  console.log(`[Migration 015] Found ${schools.length} school(s) without webhookSecret. Generating secrets...`);

  for (const school of schools) {
    const secret = crypto.randomBytes(32).toString('hex');
    await collection.updateOne(
      { _id: school._id },
      { $set: { webhookSecret: secret } }
    );
    console.log(`[Migration 015] Generated webhookSecret for school ${school.schoolId}`);
  }

  console.log(`[Migration 015] Migration complete. ${schools.length} school(s) updated.`);
}

async function down() {
  const collection = mongoose.connection.collection('schools');

  // Remove webhookSecret from all schools (rollback)
  const result = await collection.updateMany(
    { webhookSecret: { $exists: true } },
    { $unset: { webhookSecret: '' } }
  );

  console.log(`[Migration 015] Rolled back. Removed webhookSecret from ${result.modifiedCount} school(s).`);
}

module.exports = { version: VERSION, up, down };
