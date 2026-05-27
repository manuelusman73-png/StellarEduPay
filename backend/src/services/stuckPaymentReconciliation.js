'use strict';

const Payment = require('../models/paymentModel');
const { enqueueTransaction } = require('../queue/transactionQueue');
const logger = require('../utils/logger').child('StuckPaymentReconciliation');

const STUCK_PAYMENT_THRESHOLD_MS = parseInt(process.env.STUCK_PAYMENT_THRESHOLD_MS, 10) || 5 * 60 * 1000; // 5 minutes

/**
 * Find all payments in SUBMITTED status older than the threshold.
 * These are payments that were submitted to Stellar but never verified.
 * 
 * @returns {Promise<Array>} Array of stuck payment documents
 */
async function findStuckPayments() {
  const cutoffTime = new Date(Date.now() - STUCK_PAYMENT_THRESHOLD_MS);
  
  const stuckPayments = await Payment.find({
    status: 'SUBMITTED',
    submittedAt: { $lt: cutoffTime },
  }).lean();

  return stuckPayments;
}

/**
 * Re-queue stuck payments for verification.
 * Called once on server startup.
 * 
 * @returns {Promise<number>} Number of payments re-queued
 */
async function reconcileStuckPayments() {
  try {
    const stuckPayments = await findStuckPayments();

    if (stuckPayments.length === 0) {
      logger.info('No stuck payments found');
      return 0;
    }

    logger.info(`Found ${stuckPayments.length} stuck payments — re-queuing for verification`);

    let requeued = 0;
    for (const payment of stuckPayments) {
      try {
        await enqueueTransaction(payment.txHash, {
          schoolId: payment.schoolId,
          studentId: payment.studentId,
        });
        requeued++;
      } catch (err) {
        logger.error('Failed to re-queue stuck payment', {
          txHash: payment.txHash,
          studentId: payment.studentId,
          error: err.message,
        });
      }
    }

    logger.info(`Reconciliation complete — re-queued ${requeued}/${stuckPayments.length} payments`);
    return requeued;
  } catch (err) {
    logger.error('Stuck payment reconciliation failed', { error: err.message });
    throw err;
  }
}

module.exports = { reconcileStuckPayments, findStuckPayments, STUCK_PAYMENT_THRESHOLD_MS };
