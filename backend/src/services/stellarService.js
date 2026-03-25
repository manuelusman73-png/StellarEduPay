'use strict';

const { server, isAcceptedAsset, CONFIRMATION_THRESHOLD } = require('../config/stellarConfig');
const Payment = require('../models/paymentModel');
const Student = require('../models/studentModel');
const PaymentIntent = require('../models/paymentIntentModel');
const { validatePaymentAmount } = require('../utils/paymentLimits');
const { generateReferenceCode } = require('../utils/generateReferenceCode');

/**
 * Detect asset information from a Stellar payment operation.
 * Returns { assetCode, assetType, assetIssuer } or null if unsupported.
 */
function detectAsset(payOp) {
  const assetType = payOp.asset_type;
  const assetCode = assetType === 'native' ? 'XLM' : payOp.asset_code;
  const assetIssuer = assetType === 'native' ? null : payOp.asset_issuer;
  const { accepted } = isAcceptedAsset(assetCode, assetType);
  if (!accepted) return null;
  return { assetCode, assetType, assetIssuer };
}

/**
 * Normalize a raw amount string to a number with consistent precision.
 */
function normalizeAmount(rawAmount) {
  return parseFloat(parseFloat(rawAmount).toFixed(7));
}

/**
 * Extract and validate the payment operation from a transaction.
 * walletAddress is passed explicitly — supports per-school wallets.
 * Returns { payOp, memo, asset } or null if the transaction is invalid.
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
 * Fetch recent transactions to the school wallet and record new payments.
 */
async function syncPayments() {
  const transactions = await server
    .transactions()
    .forAccount(SCHOOL_WALLET)
    .order('desc')
    .limit(20)
    .call();

  for (const tx of transactions.records) {
    const exists = await Payment.findOne({ txHash: tx.hash });
    if (exists) continue;

    const valid = await extractValidPayment(tx);
    if (!valid) continue;

    const { payOp, memo } = valid;

    const intent = await PaymentIntent.findOne({ memo, status: 'pending' });
    if (!intent) continue;

    const student = await Student.findOne({ studentId: intent.studentId });
    if (!student) continue;

    const paymentAmount = parseFloat(payOp.amount);
    const senderAddress = payOp.from || null;
    const txDate = new Date(tx.created_at);
    const txLedger = tx.ledger_attr || tx.ledger || null;

    const isConfirmed = txLedger ? await checkConfirmationStatus(txLedger) : false;
    const confirmationStatus = isConfirmed ? 'confirmed' : 'pending_confirmation';

    const collision = await detectMemoCollision(memo, senderAddress, paymentAmount, student.feeAmount, txDate);

    const previousPayments = await Payment.aggregate([
      { $match: { studentId: intent.studentId } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const previousTotal = previousPayments.length ? previousPayments[0].total : 0;
    const cumulativeTotal = parseFloat((previousTotal + paymentAmount).toFixed(7));
    const remaining = parseFloat((student.feeAmount - cumulativeTotal).toFixed(7));

    let cumulativeStatus;
    if (cumulativeTotal < student.feeAmount) {
      cumulativeStatus = 'underpaid';
    } else if (cumulativeTotal > student.feeAmount) {
      cumulativeStatus = 'overpaid';
    } else {
      cumulativeStatus = 'valid';
    }

    const excessAmount = cumulativeStatus === 'overpaid'
      ? parseFloat((cumulativeTotal - student.feeAmount).toFixed(7))
      : 0;

    const feeValidation = validatePaymentAgainstFee(paymentAmount, intent.amount);

    await Payment.create({
      studentId: intent.studentId,
      txHash: tx.hash,
      amount: paymentAmount,
      feeAmount: intent.amount,
      feeValidationStatus: cumulativeStatus,
      excessAmount,
      status: 'confirmed',
      memo,
      senderAddress,
      isSuspicious: collision.suspicious,
      suspicionReason: collision.reason,
      ledger: txLedger,
      confirmationStatus,
      confirmedAt: txDate,
      referenceCode: await generateReferenceCode(),
    });

    if (isConfirmed && !collision.suspicious) {
      await Student.findOneAndUpdate(
        { studentId: intent.studentId },
        {
          totalPaid: cumulativeTotal,
          remainingBalance: remaining < 0 ? 0 : remaining,
          feePaid: cumulativeTotal >= student.feeAmount,
        }
      );
    }

    await PaymentIntent.findByIdAndUpdate(intent._id, { status: 'completed' });

    if (feeValidation.status === 'valid' || feeValidation.status === 'overpaid') {
      await Student.findOneAndUpdate({ studentId: intent.studentId }, { feePaid: true });
    }
 * Validate a payment amount against the expected fee.
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
  return {
    status: 'valid',
    excessAmount: 0,
    message: 'Payment matches the required fee',
  };
}

/**
 * Check whether a transaction has met the confirmation threshold.
 */
async function checkConfirmationStatus(txLedger) {
  const latestLedger = await server.ledgers().order('desc').limit(1).call();
  const latestSequence = latestLedger.records[0].sequence;
  return (latestSequence - txLedger) >= CONFIRMATION_THRESHOLD;
}

/**
 * Detect memo collision: same memo used by a different sender within 24h,
 * or payment amount is wildly outside the expected fee range.
 * Query is school-scoped via schoolId.
 */
async function detectMemoCollision(memo, senderAddress, paymentAmount, expectedFee, txDate, schoolId) {
  const COLLISION_WINDOW_MS = 24 * 60 * 60 * 1000;
  const windowStart = new Date(txDate.getTime() - COLLISION_WINDOW_MS);

  const recentFromOtherSender = await Payment.findOne({
    schoolId,
    studentId: memo,
    senderAddress: { $ne: senderAddress, $exists: true, $ne: null },
    confirmedAt: { $gte: windowStart },
  });

  if (recentFromOtherSender) {
    return {
      suspicious: true,
      reason: `Memo "${memo}" was used by a different sender (${recentFromOtherSender.senderAddress}) within the last 24 hours`,
    };
  }

  if (paymentAmount <= 0 || paymentAmount > expectedFee * 2) {
    return {
      suspicious: true,
      reason: `Unusual payment amount ${paymentAmount} for expected fee ${expectedFee}`,
    };
  }

  return { suspicious: false, reason: null };
}

/**
 * Persist a payment record, enforcing uniqueness on txHash.
 * Throws DUPLICATE_TX if already recorded.
 * data must include schoolId.
 */
async function recordPayment(data) {
  const exists = await Payment.findOne({ txHash: data.txHash });
  if (exists) {
    const err = new Error(`Transaction ${data.txHash} has already been processed`);
    err.code = 'DUPLICATE_TX';
    throw err;
  }
  if (!data.referenceCode) {
    data = { ...data, referenceCode: await generateReferenceCode() };
  }
  try {
    return await Payment.create(data);
  } catch (e) {
    if (e.code === 11000) {
      const err = new Error(`Transaction ${data.txHash} has already been processed`);
      err.code = 'DUPLICATE_TX';
      throw err;
    }
    throw e;
  }
}

/**
 * Verify a single transaction hash against the Stellar network and school wallet.
 * Throws structured errors for all failure cases so the controller can handle them uniformly.
 * Verify a single transaction hash against a specific school wallet.
 *
 * @param {string} txHash        - 64-char hex transaction hash
 * @param {string} walletAddress - the school's Stellar wallet address
 * @returns {object|null} Verified transaction details, or null if no valid payment found
 */
async function verifyTransaction(txHash, walletAddress) {
  const tx = await server.transactions().transaction(txHash).call();

  // 1. Validate transaction success status
  // 1. Validate transaction success
  if (tx.successful === false) {
    const err = new Error('Transaction was not successful on the Stellar network');
    err.code = 'TX_FAILED';
    throw err;
  }

  // 2. Extract and validate memo
  const memo = tx.memo ? tx.memo.trim() : null;
  if (!memo) {
    const err = new Error('Transaction memo is missing or empty — cannot identify student');
    err.code = 'MISSING_MEMO';
    throw err;
  }

  // 3. Confirm payment operation targets this school's wallet
  const ops = await tx.operations();
  const payOp = ops.records.find(op => op.type === 'payment' && op.to === walletAddress);
  if (!payOp) {
    const err = new Error(`No payment operation found targeting the school wallet (${walletAddress})`);
    err.code = 'INVALID_DESTINATION';
    throw err;
  }

  // 4. Validate asset is accepted
  const asset = detectAsset(payOp);
  if (!asset) {
    const assetCode = payOp.asset_type === 'native' ? 'XLM' : (payOp.asset_code || payOp.asset_type);
    const err = new Error(`Unsupported asset: ${assetCode}`);
    err.code = 'UNSUPPORTED_ASSET';
    err.assetCode = assetCode;
    throw err;
  }

  const amount = normalizeAmount(payOp.amount);

  // 5. Validate payment amount is within configured limits
  const limitValidation = validatePaymentAmount(amount);
  if (!limitValidation.valid) {
    const err = new Error(limitValidation.error);
    err.code = limitValidation.code;
    throw err;
  }

  // 6. Look up the student to validate fee amount
  // 5. Look up student to validate fee (student lookup is not school-scoped here
  //    since memo = studentId; recordPayment caller passes schoolId explicitly)
  const student = await Student.findOne({ studentId: memo });
  const feeAmount = student ? student.feeAmount : null;
  const feeValidation = feeAmount != null
    ? validatePaymentAgainstFee(amount, feeAmount)
    : { status: 'unknown', excessAmount: 0, message: 'Student not found, cannot validate fee' };

  return {
    hash: tx.hash,
    memo,
    studentId: memo,
    amount,
    assetCode: asset.assetCode,
    assetType: asset.assetType,
    feeAmount,
    feeValidation,
    date: tx.created_at,
    ledger: tx.ledger_attr || tx.ledger || null,
    senderAddress: payOp.from || null,
  };
}

/**
 * Fetch recent transactions to the school wallet and record new payments.
 */
async function syncPayments() {
 * Fetch recent transactions for a specific school wallet and record new payments.
 * Replaces the old syncPayments() which used a global SCHOOL_WALLET constant.
 *
 * @param {object} school - School document with { schoolId, stellarAddress }
 */
async function syncPaymentsForSchool(school) {
  const { schoolId, stellarAddress } = school;

  const transactions = await server
    .transactions()
    .forAccount(stellarAddress)
    .order('desc')
    .limit(20)
    .call();

  for (const tx of transactions.records) {
    const exists = await Payment.findOne({ txHash: tx.hash });
    if (exists) continue;

    const valid = await extractValidPayment(tx, stellarAddress);
    if (!valid) continue;

    const { payOp, memo } = valid;

    const intent = await PaymentIntent.findOne({ memo, status: 'pending' });
    const intent = await PaymentIntent.findOne({ schoolId, memo, status: 'pending' });
    if (!intent) continue;

    const student = await Student.findOne({ schoolId, studentId: intent.studentId });
    if (!student) continue;

    const paymentAmount = parseFloat(payOp.amount);
    
    // Validate payment amount is within configured limits
    const limitValidation = validatePaymentAmount(paymentAmount);
    if (!limitValidation.valid) {
      // Skip payments outside limits during sync
      continue;
    }

    const senderAddress = payOp.from || null;
    const txDate = new Date(tx.created_at);
    const txLedger = tx.ledger_attr || tx.ledger || null;

    const isConfirmed = txLedger ? await checkConfirmationStatus(txLedger) : false;
    const confirmationStatus = isConfirmed ? 'confirmed' : 'pending_confirmation';

    const collision = await detectMemoCollision(memo, senderAddress, paymentAmount, student.feeAmount, txDate, schoolId);

    const previousPayments = await Payment.aggregate([
      { $match: { schoolId, studentId: intent.studentId } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const previousTotal = previousPayments.length ? previousPayments[0].total : 0;
    const cumulativeTotal = parseFloat((previousTotal + paymentAmount).toFixed(7));
    const remaining = parseFloat((student.feeAmount - cumulativeTotal).toFixed(7));

    let cumulativeStatus;
    if (cumulativeTotal < student.feeAmount) {
      cumulativeStatus = 'underpaid';
    } else if (cumulativeTotal > student.feeAmount) {
      cumulativeStatus = 'overpaid';
    } else {
      cumulativeStatus = 'valid';
    }

    const excessAmount = cumulativeStatus === 'overpaid'
      ? parseFloat((cumulativeTotal - student.feeAmount).toFixed(7))
      : 0;

    const feeValidation = validatePaymentAgainstFee(paymentAmount, intent.amount);

    await Payment.create({
      schoolId,
      studentId: intent.studentId,
      txHash: tx.hash,
      amount: paymentAmount,
      feeAmount: intent.amount,
      feeValidationStatus: cumulativeStatus,
      excessAmount,
      status: 'confirmed',
      memo,
      senderAddress,
      isSuspicious: collision.suspicious,
      suspicionReason: collision.reason,
      ledger: txLedger,
      confirmationStatus,
      confirmedAt: txDate,
    });

    if (isConfirmed && !collision.suspicious) {
      await Student.findOneAndUpdate(
        { schoolId, studentId: intent.studentId },
        {
          totalPaid: cumulativeTotal,
          remainingBalance: remaining < 0 ? 0 : remaining,
          feePaid: cumulativeTotal >= student.feeAmount,
        }
      );
    }

    await PaymentIntent.findByIdAndUpdate(intent._id, { status: 'completed' });

    if (feeValidation.status === 'valid' || feeValidation.status === 'overpaid') {
      await Student.findOneAndUpdate({ studentId: intent.studentId }, { feePaid: true });
    }
  }
}

/**
 * Re-check all pending_confirmation payments for a school and promote them
 * to confirmed once the ledger threshold has been met.
 *
 * @param {string} schoolId
 */
async function finalizeConfirmedPayments(schoolId) {
  const pending = await Payment.find({
    schoolId,
    confirmationStatus: 'pending_confirmation',
    isSuspicious: false,
  });

  for (const payment of pending) {
    if (!payment.ledger) continue;
    const isConfirmed = await checkConfirmationStatus(payment.ledger);
    if (!isConfirmed) continue;

    await Payment.findByIdAndUpdate(payment._id, { confirmationStatus: 'confirmed' });

    const student = await Student.findOne({ schoolId, studentId: payment.studentId });
    if (!student) continue;

    const agg = await Payment.aggregate([
      { $match: { schoolId, studentId: payment.studentId, confirmationStatus: 'confirmed', isSuspicious: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalPaid = agg.length ? parseFloat(agg[0].total.toFixed(7)) : 0;
    const remainingBalance = parseFloat(Math.max(0, student.feeAmount - totalPaid).toFixed(7));

    await Student.findOneAndUpdate(
      { schoolId, studentId: payment.studentId },
      { totalPaid, remainingBalance, feePaid: totalPaid >= student.feeAmount }
    );
  }
}

module.exports = {
  syncPaymentsForSchool,
  verifyTransaction,
  validatePaymentAgainstFee,
  detectAsset,
  normalizeAmount,
  extractValidPayment,
  detectMemoCollision,
  finalizeConfirmedPayments,
  checkConfirmationStatus,
  recordPayment,
};
