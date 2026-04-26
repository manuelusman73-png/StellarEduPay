'use strict';

/**
 * Migration 007 — Add compound index { studentId: 1, confirmedAt: -1 } to payments
 *
 * GET /api/payments/:studentId sorts by confirmedAt descending. Without this
 * index MongoDB performs a full collection scan + in-memory sort on every
 * payment-history request.
 *
 * Also ensures { schoolId: 1, confirmedAt: -1 } exists for school-level queries.
 */

const mongoose = require('mongoose');

const VERSION = '007_add_payment_student_confirmedAt_index';

async function up() {
  const collection = mongoose.connection.collection('payments');
  await collection.createIndex({ studentId: 1, confirmedAt: -1 }, { background: true });
  console.log('[007] Created index { studentId: 1, confirmedAt: -1 } on payments');
  await collection.createIndex({ schoolId: 1, confirmedAt: -1 }, { background: true });
  console.log('[007] Ensured index { schoolId: 1, confirmedAt: -1 } on payments');
}

async function down() {
  const collection = mongoose.connection.collection('payments');
  await collection.dropIndex({ studentId: 1, confirmedAt: -1 });
  console.log('[007] Dropped index { studentId: 1, confirmedAt: -1 } from payments');
}

module.exports = { version: VERSION, up, down };
