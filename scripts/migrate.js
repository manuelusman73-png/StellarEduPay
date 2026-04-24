#!/usr/bin/env node
'use strict';

/**
 * Migration CLI
 *
 * Usage:
 *   node scripts/migrate.js          # run all pending migrations
 *   node scripts/migrate.js rollback # roll back the last applied migration
 */

require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });

const mongoose = require('mongoose');
const { runMigrations, rollback } = require('../backend/src/services/migrationRunner');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI is not set');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI);

  const command = process.argv[2];
  if (command === 'rollback') {
    await rollback();
  } else {
    await runMigrations();
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
