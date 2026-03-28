'use strict';

const { server, isAcceptedAsset, CONFIRMATION_THRESHOLD } = require('../config/stellarConfig');
const Payment = require('../models/paymentModel');
const Student = require('../models/studentModel');
const PaymentIntent = require('../models/paymentIntentModel');
const { validatePaymentAmount } = require('../utils/paymentLimits');
const { generateReferenceCode } = require('../utils/generateReferenceCode');
const { withStellarRetry } = require('../utils/withStellarRetry');
const logger = require('../utils/logger').child('StellarService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectAsset(payOp) {
  const assetType = payOp.asset_type;
  const assetCode = assetType === 'native' ? 'XLM' : payOp.asset_code;
  const { accepted } = isAcceptedAsset(assetCode, assetType);
  if (!accepted) return null;
  return { assetCode, assetType, assetIssuer: payOp.asset_issuer || null };
}

function normalizeAmount(rawAmount) {
  return parseFloat(parseFloat(rawAmount).toFixed(7));
}

/**
 * Validate a payment amount against the expected fee.
 * Returns { status, excessAmount, message }.
 * status is one of: 'valid' | 'overpaid' | 'underpaid'
 */
function validatePaymentAgainstFee(paymentAmount, expectedFee) {
  if (paymentAmount < expectedFee) {
    return {
      status: 'underpaid',
      excessAmount: 0,
      message: `Payment of ${paymentAmount} is less than the required fee of ${expectedFee}`,
    };
  }
  if (paymentAmount > expectedFee) {
    const excess = parseFloat((paymentAmount - expectedFee).toFixed(7));
    return {
      status: 'overpaid',
      excessAmount: excess,
      message: `Payment of ${paymentAmount} exceeds the required fee of ${expectedFee} by ${excess}`,
    };
  }
  return { status: 'valid', excessAmount: 0, message: 'Payment matches the required fee' };
}

async function checkConfirmationStatus(txLedger) {
  const latestLedger = await withStellarRetry(
    () => server.ledgers().order('desc').limit(1).call(),
    { label: 'checkConfirmationStatus' },
  );
  return latestLedger.records[0].sequence - txLedger >= CONFIRMATION_THRESHOLD;
}

/**
 * Extract the valid payment operation from a transaction targeting walletAddress.
 * Returns { payOp, memo, asset } or null if the transaction should be skipped.
 */
async function extractValidPayment(tx, walletAddress) {
  if (!tx.successful) return null;

  const memo = tx.memo ? tx.memo.trim() : null;
  if (!memo) return null;

  const ops = await tx.operations();
  const payOp = ops.records.find(op => op.type === 'payment' && op.to === walletAddress);
  if (!payOp) return null;

  const asset = detectAsset(payOp);
  if (!asset) return null;

  return { payOp, memo, asset };
}

/**
 * Parse an incoming Stellar transaction for memo and payment amounts.
 */
async function parseIncomingTransaction(txHash, walletAddress = null) {
  const tx = await server.transactions().transaction(txHash).call();
  const memo = tx.memo ? tx.memo.trim() : null;

  const ops = await tx.operations();
  const payments = ops.records
    .filter(op => op.type === 'payment' && (!walletAddress || op.to === walletAddress))
    .map(op => ({
      from: op.from || null,
      to: op.to,
      amount: normalizeAmount(op.amount),
      assetCode: op.asset_type === 'native' ? 'XLM' : op.asset_code,
      assetType: op.asset_type,
      assetIssuer: op.asset_issuer || null,
    }));

  return {
    hash: tx.hash,
    successful: tx.successful,
    memo,
    payments,
    created_at: tx.created_at,
    ledger: tx.ledger_attr || tx.ledger || null,
  };
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Verify a single transaction hash against a specific school wallet.
 * Throws structured errors for all failure cases.
 */
async function verifyTransaction(txHash, walletAddress) {
  const tx = await withStellarRetry(
    () => server.transactions().transaction(txHash).call(),
    { label: 'verifyTransaction' },
  );

  if (!tx.successful) {
    throw Object.assign(new Error('Transaction was not successful on the Stellar network'), { code: 'TX_FAILED' });
  }

  const memo = tx.memo ? tx.memo.trim() : null;
  if (!memo) {
    throw Object.assign(new Error('Transaction memo is missing or empty — cannot identify student'), { code: 'MISSING_MEMO' });
  }

  const ops = await withStellarRetry(() => tx.operations(), { label: 'verifyTransaction.operations' });
  const payOp = ops.records.find(op => op.type === 'payment' && op.to === walletAddress);
  if (!payOp) {
    throw Object.assign(
      new Error(`No payment operation found targeting the school wallet (${walletAddress})`),
      { code: 'INVALID_DESTINATION' },
    );
  }

  const asset = detectAsset(payOp);
  if (!asset) {
    const assetCode = payOp.asset_type === 'native' ? 'XLM' : (payOp.asset_code || payOp.asset_type);
    throw Object.assign(new Error(`Unsupported asset: ${assetCode}`), { code: 'UNSUPPORTED_ASSET', assetCode });
  }

  const amount = normalizeAmount(payOp.amount);
  const limitValidation = validatePaymentAmount(amount);
  if (!limitValidation.valid) {
    throw Object.assign(new Error(limitValidation.error), { code: limitValidation.code });
  }

  const student = await Student.findOne({ studentId: memo });
  const feeAmount = student ? student.feeAmount : null;
  const feeValidation = feeAmount != null
    ? validatePaymentAgainstFee(amount, feeAmount)
    : { status: 'unknown', excessAmount: 0, message: 'Student not found, cannot validate fee' };

  return {
    hash: tx.hash,
    memo,
    amount,
    assetCode: asset.assetCode,
    assetType: asset.assetType,
    feeAmount,
    feeValidation,
    date: tx.created_at,
  };
}

/**
 * Sync recent transactions for a school from the Stellar network.
 *
 * Fee validation (Issue #220):
 *  - Underpayments are recorded with feeValidationStatus='underpaid' and status='FAILED'
 *    so admins can review them; feePaid is NOT set to true.
 *  - Exact payments and overpayments are recorded with status='SUCCESS' and feePaid=true.
 */
async function syncPaymentsForSchool(school) {
  const { schoolId, stellarAddress } = school;

  const transactions = await withStellarRetry(
    () => server.transactions().forAccount(stellarAddress).order('desc').limit(20).call(),
    { label: `syncPaymentsForSchool(${schoolId})` },
  );

  for (const tx of transactions.records) {
    if (await Payment.findOne({ txHash: tx.hash })) continue;

    // Record failed on-chain transactions for audit purposes
    if (tx.successful === false) {
      const memo = tx.memo ? tx.memo.trim() : null;
      await Payment.create({
        schoolId,
        studentId: memo || 'unknown',
        txHash: tx.hash,
        amount: 0,
        status: 'FAILED',
        memo: memo || null,
        feeValidationStatus: 'unknown',
        confirmationStatus: 'failed',
        confirmedAt: tx.created_at ? new Date(tx.created_at) : new Date(),
      }).catch(e => { if (e.code !== 11000) logger.error('Failed to record failed tx', { txHash: tx.hash, error: e.message }); });
      continue;
    }

    const valid = await extractValidPayment(tx, stellarAddress);
    if (!valid) continue;

    const { payOp, memo, asset } = valid;

    const intent = await PaymentIntent.findOne({ schoolId, memo, status: 'pending' });
    if (!intent) continue;

    const student = await Student.findOne({ schoolId, studentId: intent.studentId });
    if (!student) continue;

    const paymentAmount = normalizeAmount(payOp.amount);
    const limitValidation = validatePaymentAmount(paymentAmount);
    if (!limitValidation.valid) continue;

    const senderAddress = payOp.from || null;
    const txDate = new Date(tx.created_at);
    const txLedger = tx.ledger_attr || tx.ledger || null;
    const isConfirmed = txLedger ? await checkConfirmationStatus(txLedger) : false;
    const confirmationStatus = isConfirmed ? 'confirmed' : 'pending_confirmation';

    // ── Fee Validation (Issue #220) ───────────────────────────────────────────
    const feeValidation = validatePaymentAgainstFee(paymentAmount, student.feeAmount);

    if (feeValidation.status === 'underpaid') {
      // Record underpayment for admin review but do NOT mark student as paid
      logger.warn('Underpaid transaction recorded', {
        txHash: tx.hash, schoolId, studentId: intent.studentId,
        paid: paymentAmount, required: student.feeAmount,
      });
      await Payment.create({
        schoolId,
        studentId: intent.studentId,
        txHash: tx.hash,
        amount: paymentAmount,
        feeAmount: student.feeAmount,
        feeValidationStatus: 'underpaid',
        excessAmount: 0,
        status: 'FAILED',
        memo,
        senderAddress,
        ledger: txLedger,
        confirmationStatus: 'failed',
        confirmedAt: txDate,
      }).catch(e => { if (e.code !== 11000) logger.error('Failed to record underpayment', { txHash: tx.hash, error: e.message }); });
      continue;
    }
    // ─────────────────────────────────────────────────────────────────────────

    await Payment.create({
      schoolId,
      studentId: intent.studentId,
      txHash: tx.hash,
      amount: paymentAmount,
      feeAmount: student.feeAmount,
      assetCode: asset.assetCode,
      assetType: asset.assetType,
      feeValidationStatus: feeValidation.status,
      excessAmount: feeValidation.excessAmount,
      status: 'SUCCESS',
      memo,
      senderAddress,
      ledger: txLedger,
      confirmationStatus,
      confirmedAt: txDate,
      referenceCode: await generateReferenceCode(),
    });

    logger.info('Transaction recorded', {
      txHash: tx.hash, schoolId, studentId: intent.studentId,
      amount: paymentAmount, feeValidationStatus: feeValidation.status,
    });

    if (isConfirmed) {
      await Student.findOneAndUpdate(
        { schoolId, studentId: intent.studentId },
        { feePaid: true },
      );
    }

    await PaymentIntent.findByIdAndUpdate(intent._id, { status: 'completed' });
  }
}

/**
 * Finalize payments that were pending confirmation.
 */
async function finalizeConfirmedPayments(schoolId) {
  const pending = await Payment.find({
    schoolId,
    confirmationStatus: 'pending_confirmation',
    status: 'SUCCESS',
  });

  for (const payment of pending) {
    if (!payment.ledger) continue;
    const isConfirmed = await checkConfirmationStatus(payment.ledger);
    if (!isConfirmed) continue;

    await Payment.findByIdAndUpdate(payment._id, { confirmationStatus: 'confirmed' });

    await Student.findOneAndUpdate(
      { schoolId, studentId: payment.studentId },
      { feePaid: true },
    );
  }
}

/**
 * Persist a payment record, enforcing uniqueness on txHash.
 * Throws DUPLICATE_TX if already recorded.
 */
async function recordPayment(data) {
  if (!data.referenceCode) {
    data = { ...data, referenceCode: await generateReferenceCode() };
  }
  try {
    return await Payment.create(data);
  } catch (e) {
    if (e.code === 11000) {
      throw Object.assign(new Error(`Transaction ${data.transactionHash} has already been processed`), { code: 'DUPLICATE_TX' });
    }
    throw e;
  }
}

module.exports = {
  syncPaymentsForSchool,
  finalizeConfirmedPayments,
  verifyTransaction,
  parseIncomingTransaction,
  validatePaymentAgainstFee,
  extractValidPayment,
  detectAsset,
  normalizeAmount,
  checkConfirmationStatus,
  recordPayment,
};
