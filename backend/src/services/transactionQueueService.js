'use strict';

/**
 * Transaction Queue Service
 *
 * Bridges the BullMQ transaction processing queue with the Stellar verification
 * logic. Starts the worker on app boot and exposes helpers used by the controller.
 */

const { startTransactionWorker } = require('../queue/transactionQueue');
const { verifyTransaction, recordPayment } = require('./stellarService');
const Payment = require('../models/paymentModel');
const Student = require('../models/studentModel');
const PaymentIntent = require('../models/paymentIntentModel');
const logger = require('../utils/logger');

const PERMANENT_FAIL_CODES = [
  'TX_FAILED', 'MISSING_MEMO', 'INVALID_DESTINATION',
  'UNSUPPORTED_ASSET', 'AMOUNT_TOO_LOW', 'AMOUNT_TOO_HIGH', 'UNDERPAID',
];

/**
 * Core processor executed by the BullMQ worker for each job.
 */
async function processTransactionJob(job) {
  const { txHash, schoolId, school } = job.data;

  // Skip if already recorded
  const existing = await Payment.findOne({ txHash, schoolId });
  if (existing) {
    logger.info('[TxQueueService] Transaction already processed, skipping', { txHash });
    return { skipped: true, txHash };
  }

  const result = await verifyTransaction(txHash, school.stellarAddress);
  if (!result) throw Object.assign(new Error('No valid payment found'), { code: 'NOT_FOUND' });

  // Reject underpaid
  if (result.feeValidation.status === 'underpaid') {
    const err = new Error(result.feeValidation.message);
    err.code = 'UNDERPAID';
    throw err;
  }

  // Validate intent expiry
  const intent = await PaymentIntent.findOne({ memo: result.memo, schoolId });
  if (intent?.expiresAt && intent.expiresAt < new Date()) {
    await PaymentIntent.findByIdAndUpdate(intent._id, { status: 'expired' });
    throw Object.assign(new Error('Payment intent has expired'), { code: 'INTENT_EXPIRED' });
  }

  const studentObj = await Student.findOne({ studentId: result.studentId || result.memo });
  if (!studentObj) throw Object.assign(new Error('Associated student not found'), { code: 'NOT_FOUND' });

  const now = new Date();
  await recordPayment({
    schoolId,
    studentId:           result.studentId || result.memo,
    txHash:              result.hash,
    amount:              result.amount,
    feeAmount:           result.feeAmount,
    feeValidationStatus: result.feeValidation.status,
    excessAmount:        result.feeValidation.excessAmount,
    networkFee:          result.networkFee,
    status:              'SUCCESS',
    memo:                result.memo,
    senderAddress:       result.senderAddress || null,
    ledgerSequence:      result.ledger || null,
    confirmationStatus:  'confirmed',
    confirmedAt:         result.date ? new Date(result.date) : now,
    verifiedAt:          now,
  });

  logger.info('[TxQueueService] Transaction processed successfully', { txHash });
  return { success: true, txHash, studentId: result.studentId || result.memo };
}

/**
 * Processor wrapper: permanent errors are not retried.
 */
async function jobProcessor(job) {
  try {
    return await processTransactionJob(job);
  } catch (err) {
    if (PERMANENT_FAIL_CODES.includes(err.code)) {
      // Mark as permanently failed in Payment collection for audit trail
      await Payment.create({
        schoolId:  job.data.schoolId,
        studentId: 'unknown',
        txHash:    job.data.txHash,
        amount:    0,
        status:    'FAILED',
        feeValidationStatus: 'unknown',
      }).catch(() => {});
      // Throw a non-retryable error by exhausting attempts
      err.message = `[permanent] ${err.message}`;
    }
    throw err;
  }
}

let worker = null;

function startWorker() {
  if (worker) return worker;
  worker = startTransactionWorker(jobProcessor);
  return worker;
}

async function stopWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}

module.exports = { startWorker, stopWorker };
