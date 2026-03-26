'use strict';

const School = require('../models/schoolModel');
const Payment = require('../models/paymentModel');
const Student = require('../models/studentModel');
const { server } = require('../config/stellarConfig');
const { extractValidPayment, validatePaymentAgainstFee, detectMemoCollision, detectAbnormalPatterns, checkConfirmationStatus } = require('./stellarService');
const { validatePaymentAmount } = require('../utils/paymentLimits');
const { generateReferenceCode } = require('../utils/generateReferenceCode');
const logger = require('../utils/logger').child('TransactionPollingService');

let pollingInterval = null;
let isPolling = false;

const POLLING_INTERVAL_MS = 30000; // Poll every 30 seconds
const TRANSACTIONS_PER_POLL = 20;

/**
 * Process a single transaction for a school
 */
async function processTransaction(tx, school) {
  const { schoolId, stellarAddress } = school;

  // Skip if already processed
  const existing = await Payment.findOne({ txHash: tx.hash });
  if (existing) {
    return { processed: false, reason: 'duplicate' };
  }

  // Extract and validate payment
  const valid = await extractValidPayment(tx, stellarAddress);
  if (!valid) {
    return { processed: false, reason: 'invalid_payment' };
  }

  const { payOp, memo, asset } = valid;
  const paymentAmount = parseFloat(payOp.amount);

  // Validate payment amount is within configured limits
  const limitValidation = validatePaymentAmount(paymentAmount);
  if (!limitValidation.valid) {
    logger.warn('Payment outside limits', { 
      txHash: tx.hash, 
      schoolId, 
      amount: paymentAmount,
      error: limitValidation.error 
    });
    return { processed: false, reason: 'amount_limit_exceeded' };
  }

  // Find student by memo (studentId)
  const student = await Student.findOne({ schoolId, studentId: memo });
  if (!student) {
    logger.warn('Student not found for memo', { txHash: tx.hash, schoolId, memo });
    return { processed: false, reason: 'student_not_found' };
  }

  const senderAddress = payOp.from || null;
  const txDate = new Date(tx.created_at);
  const txLedger = tx.ledger_attr || tx.ledger || null;
  const isConfirmed = txLedger ? await checkConfirmationStatus(txLedger) : false;
  const confirmationStatus = isConfirmed ? 'confirmed' : 'pending_confirmation';

  // Check for suspicious activity
  const collision = await detectMemoCollision(memo, senderAddress, paymentAmount, student.feeAmount, txDate, schoolId);
  const abnormal = await detectAbnormalPatterns(senderAddress, paymentAmount, student.feeAmount, txDate, schoolId);
  
  const isSuspicious = collision.suspicious || abnormal.suspicious;
  const suspicionReason = [collision.reason, abnormal.reason].filter(Boolean).join('; ') || null;

  // Calculate cumulative totals
  const previousPayments = await Payment.aggregate([
    { $match: { schoolId, studentId: memo, confirmationStatus: 'confirmed', isSuspicious: false } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const previousTotal = previousPayments.length ? previousPayments[0].total : 0;
  const cumulativeTotal = parseFloat((previousTotal + paymentAmount).toFixed(7));
  const remaining = parseFloat((student.feeAmount - cumulativeTotal).toFixed(7));

  let cumulativeStatus;
  if (cumulativeTotal < student.feeAmount) cumulativeStatus = 'underpaid';
  else if (cumulativeTotal > student.feeAmount) cumulativeStatus = 'overpaid';
  else cumulativeStatus = 'valid';

  const excessAmount = cumulativeStatus === 'overpaid'
    ? parseFloat((cumulativeTotal - student.feeAmount).toFixed(7))
    : 0;

  const feeValidation = validatePaymentAgainstFee(paymentAmount, student.feeAmount);

  // Extract network fee
  const networkFee = parseFloat(tx.fee_paid || '0') / 10000000;

  // Record payment
  const paymentData = {
    schoolId,
    studentId: memo,
    txHash: tx.hash,
    transactionHash: tx.hash,
    amount: paymentAmount,
    feeAmount: student.feeAmount,
    feeValidationStatus: cumulativeStatus,
    excessAmount,
    status: isSuspicious ? 'FAILED' : (isConfirmed ? 'SUCCESS' : 'PENDING'),
    memo,
    senderAddress,
    isSuspicious,
    suspicionReason,
    ledger: txLedger,
    ledgerSequence: txLedger,
    confirmationStatus: isSuspicious ? 'failed' : confirmationStatus,
    confirmedAt: txDate,
    referenceCode: await generateReferenceCode(),
    networkFee,
  };

  try {
    await Payment.create(paymentData);
    
    // Update student balance if confirmed and not suspicious
    if (isConfirmed && !isSuspicious) {
      await Student.findOneAndUpdate(
        { schoolId, studentId: memo },
        {
          totalPaid: cumulativeTotal,
          remainingBalance: Math.max(0, remaining),
          feePaid: cumulativeTotal >= student.feeAmount,
        }
      );
    }

    logger.info('Transaction auto-detected and recorded', {
      txHash: tx.hash,
      schoolId,
      studentId: memo,
      amount: paymentAmount,
      feeValidationStatus: cumulativeStatus,
      isSuspicious,
      confirmationStatus,
    });

    return { processed: true, payment: paymentData };
  } catch (error) {
    if (error.code === 11000) {
      return { processed: false, reason: 'duplicate' };
    }
    logger.error('Failed to record payment', { error: error.message, txHash: tx.hash });
    throw error;
  }
}

/**
 * Poll transactions for a single school
 */
async function pollSchoolTransactions(school) {
  try {
    const transactions = await server
      .transactions()
      .forAccount(school.stellarAddress)
      .order('desc')
      .limit(TRANSACTIONS_PER_POLL)
      .call();

    let processedCount = 0;
    let skippedCount = 0;

    for (const tx of transactions.records) {
      const result = await processTransaction(tx, school);
      if (result.processed) {
        processedCount++;
      } else {
        skippedCount++;
      }
    }

    if (processedCount > 0) {
      logger.info('Polling completed for school', {
        schoolId: school.schoolId,
        processed: processedCount,
        skipped: skippedCount,
      });
    }

    return { schoolId: school.schoolId, processed: processedCount, skipped: skippedCount };
  } catch (error) {
    logger.error('Error polling school transactions', {
      schoolId: school.schoolId,
      error: error.message,
    });
    return { schoolId: school.schoolId, error: error.message };
  }
}

/**
 * Poll all active schools for new transactions
 */
async function pollAllSchools() {
  if (!isPolling) return;

  try {
    const schools = await School.find({ isActive: true });
    
    if (schools.length === 0) {
      logger.debug('No active schools to poll');
      return;
    }

    logger.debug(`Polling ${schools.length} active schools`);

    const results = await Promise.allSettled(
      schools.map(school => pollSchoolTransactions(school))
    );

    const summary = results.reduce((acc, result) => {
      if (result.status === 'fulfilled') {
        acc.processed += result.value.processed || 0;
        acc.skipped += result.value.skipped || 0;
      } else {
        acc.errors++;
      }
      return acc;
    }, { processed: 0, skipped: 0, errors: 0 });

    if (summary.processed > 0 || summary.errors > 0) {
      logger.info('Polling cycle completed', summary);
    }
  } catch (error) {
    logger.error('Error in polling cycle', { error: error.message });
  }
}

/**
 * Start the background polling service
 */
function startPolling() {
  if (isPolling) {
    logger.warn('Polling service already running');
    return;
  }

  isPolling = true;
  logger.info('Starting transaction polling service', { intervalMs: POLLING_INTERVAL_MS });

  // Run immediately on startup
  pollAllSchools();

  // Then poll at regular intervals
  pollingInterval = setInterval(pollAllSchools, POLLING_INTERVAL_MS);
}

/**
 * Stop the background polling service
 */
function stopPolling() {
  if (!isPolling) return;

  isPolling = false;
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  logger.info('Transaction polling service stopped');
}

module.exports = {
  startPolling,
  stopPolling,
  pollAllSchools,
  pollSchoolTransactions,
  processTransaction,
};
