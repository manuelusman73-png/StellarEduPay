/**
 * Migration: Add performance indexes to Student collection
 * 
 * Ensures { schoolId: 1, class: 1 } and { schoolId: 1, feePaid: 1 } indexes
 * exist for class-based and payment status queries.
 * 
 * Run with: node backend/migrations/002_add_student_indexes.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config');

async function migrate() {
  try {
    await mongoose.connect(config.MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('students');

    // Check existing indexes
    const existingIndexes = await collection.indexes();
    console.log('Existing indexes:', existingIndexes.map(i => i.name));

    // Add { schoolId: 1, class: 1 } if not present
    const classIndexExists = existingIndexes.some(
      i => i.key && i.key.schoolId === 1 && i.key.class === 1
    );
    if (!classIndexExists) {
      await collection.createIndex({ schoolId: 1, class: 1 });
      console.log('✓ Created index: { schoolId: 1, class: 1 }');
    } else {
      console.log('✓ Index { schoolId: 1, class: 1 } already exists');
    }

    // Add { schoolId: 1, feePaid: 1 } if not present
    const feePaidIndexExists = existingIndexes.some(
      i => i.key && i.key.schoolId === 1 && i.key.feePaid === 1
    );
    if (!feePaidIndexExists) {
      await collection.createIndex({ schoolId: 1, feePaid: 1 });
      console.log('✓ Created index: { schoolId: 1, feePaid: 1 }');
    } else {
      console.log('✓ Index { schoolId: 1, feePaid: 1 } already exists');
    }

    console.log('\nMigration complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
