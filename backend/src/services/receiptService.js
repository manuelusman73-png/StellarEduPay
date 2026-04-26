'use strict';

const Receipt = require('../models/receiptModel');
const Student = require('../models/studentModel');
const School = require('../models/schoolModel');

/**
 * Create a receipt for a successful payment.
 * Idempotent — returns the existing receipt if one already exists for txHash.
 *
 * @param {object} payment - Payment document or plain object with payment fields
 * @returns {Promise<object>} The receipt document
 */
async function createReceipt(payment) {
  const existing = await Receipt.findOne({ txHash: payment.txHash });
  if (existing) return existing;

  // Resolve student name and school name for the receipt
  const [student, school] = await Promise.all([
    Student.findOne({ schoolId: payment.schoolId, studentId: payment.studentId }).lean(),
    School.findOne({ schoolId: payment.schoolId }).lean(),
  ]);

  return Receipt.create({
    txHash: payment.txHash,
    studentId: payment.studentId,
    studentName: student ? student.name : null,
    schoolId: payment.schoolId,
    schoolName: school ? school.name : null,
    amount: payment.amount,
    assetCode: payment.assetCode || 'XLM',
    feeAmount: payment.feeAmount || null,
    feeValidationStatus: payment.feeValidationStatus || 'unknown',
    memo: payment.memo || null,
    confirmedAt: payment.confirmedAt || new Date(),
  });
}

/**
 * Retrieve a receipt by transaction hash, scoped to a school.
 *
 * @param {string} txHash
 * @param {string} schoolId
 * @returns {Promise<object|null>}
 */
async function getReceiptByTxHash(txHash, schoolId) {
  return Receipt.findOne({ txHash, schoolId }).lean();
}

module.exports = { createReceipt, getReceiptByTxHash };
