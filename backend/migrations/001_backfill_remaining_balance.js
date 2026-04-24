/**
 * Migration 001 — Backfill remainingBalance on existing students.
 * Sets remainingBalance = feeAmount - totalPaid for any student where it is null.
 */
const mongoose = require('mongoose');

module.exports = {
  version: '001_backfill_remaining_balance',

  async up() {
    const Student = mongoose.model('Student');
    await Student.updateMany(
      { remainingBalance: null },
      [{ $set: { remainingBalance: { $subtract: ['$feeAmount', '$totalPaid'] } } }]
    );
  },

  async down() {
    const Student = mongoose.model('Student');
    await Student.updateMany({}, { $set: { remainingBalance: null } });
  },
};
