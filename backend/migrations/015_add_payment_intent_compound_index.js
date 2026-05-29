'use strict';

/**
 * Migration 015: Add compound index on paymentIntents for active intent lookup
 * 
 * Optimizes createPaymentIntent's query:
 *   PaymentIntent.findOne({ studentId, schoolId, expiresAt: { $gt: new Date() } })
 * 
 * Index: { studentId: 1, schoolId: 1, expiresAt: 1 }
 */

const mongoose = require('mongoose');

async function up() {
  const db = mongoose.connection.db;
  const collection = db.collection('paymentintents');
  
  try {
    await collection.createIndex(
      { studentId: 1, schoolId: 1, expiresAt: 1 },
      { name: 'studentId_1_schoolId_1_expiresAt_1' }
    );
    console.log('✓ Created compound index on paymentintents: { studentId: 1, schoolId: 1, expiresAt: 1 }');
  } catch (err) {
    if (err.code === 85) {
      // Index already exists with different options — drop and recreate
      await collection.dropIndex('studentId_1_schoolId_1_expiresAt_1');
      await collection.createIndex(
        { studentId: 1, schoolId: 1, expiresAt: 1 },
        { name: 'studentId_1_schoolId_1_expiresAt_1' }
      );
      console.log('✓ Recreated compound index on paymentintents: { studentId: 1, schoolId: 1, expiresAt: 1 }');
    } else {
      throw err;
    }
  }
}

async function down() {
  const db = mongoose.connection.db;
  const collection = db.collection('paymentintents');
  
  try {
    await collection.dropIndex('studentId_1_schoolId_1_expiresAt_1');
    console.log('✓ Dropped compound index on paymentintents');
  } catch (err) {
    if (err.code === 27) {
      // Index doesn't exist — no-op
      console.log('✓ Index does not exist, skipping drop');
    } else {
      throw err;
    }
  }
}

module.exports = { up, down };
