'use strict';

/**
 * Migration 010 — Backfill studentDeleted on orphaned payment records
 *
 * Payments whose studentId does not match any active Student document are
 * orphaned (the student was hard-deleted before this flag existed). This
 * migration sets studentDeleted: true on those records so they are excluded
 * from reports and reconciliation queries.
 */

const mongoose = require('mongoose');

const VERSION = '010_backfill_student_deleted_payments';

async function up() {
  const payments = mongoose.connection.collection('payments');
  const students = mongoose.connection.collection('students');

  // Collect all active student IDs
  const activeStudentIds = await students
    .distinct('studentId', { deletedAt: null });

  const result = await payments.updateMany(
    {
      studentDeleted: { $ne: true },
      studentId: { $nin: activeStudentIds },
    },
    { $set: { studentDeleted: true } },
  );

  console.log(`[010] Marked ${result.modifiedCount} orphaned payment(s) as studentDeleted`);
}

async function down() {
  const payments = mongoose.connection.collection('payments');
  await payments.updateMany(
    { studentDeleted: true },
    { $unset: { studentDeleted: '' } },
  );
  console.log('[010] Removed studentDeleted flag from all payments');
}

module.exports = { version: VERSION, up, down };
