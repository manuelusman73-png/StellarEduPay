const { server, SCHOOL_WALLET, isAcceptedAsset, CONFIRMATION_THRESHOLD } = require('../config/stellarConfig');
const Payment = require('../models/paymentModel');
const Student = require('../models/studentModel');
const PaymentIntent = require('../models/paymentIntentModel');

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
 * Returns { payOp, memo, asset } or null if the transaction is invalid.
 * Checks: successful flag, memo presence, destination wallet, accepted asset.
 */
async function extractValidPayment(tx) {
  if (!tx.successful) return null;

  const memo = tx.memo ? tx.memo.trim() : null;
  if (!memo) return null;

  const ops = await tx.operations();
  const payOp = ops.records.find(op => op.type === 'payment' && op.to === SCHOOL_WALLET);
  if (!payOp) return null;

  const asset = detectAsset(payOp);
  if (!asset) return null;

  return { payOp, memo, asset };
}

// Fetch recent transactions to the school wallet and record new payments
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
    const student = await Student.findOne({ studentId: memo });
    if (!student) continue;

    const paymentAmount = parseFloat(payOp.amount);
    const feeValidation = validatePaymentAgainstFee(paymentAmount, student.feeAmount);
    const memo = tx.memo;
    if (!memo) continue;

    // Reject outdated transactions
    if (!isWithinTimeWindow(tx.created_at)) continue;

    const exists = await Payment.findOne({ txHash: tx.hash });
    if (exists) continue;

    const ops = await tx.operations();
    const payOp = ops.records.find(op => op.type === 'payment' && op.to === SCHOOL_WALLET);
    if (!payOp) continue;

    const asset = detectAsset(payOp);
    if (!asset) continue;

    // Find the corresponding payment intent by memo
    const intent = await PaymentIntent.findOne({ memo, status: 'pending' });
    if (!intent) continue;

    const student = await Student.findOne({ studentId: intent.studentId });
    if (!student) continue;

    const paymentAmount = parseFloat(payOp.amount);
    const senderAddress = payOp.from || null;
    const txDate = new Date(tx.created_at);
    const txLedger = tx.ledger_attr || tx.ledger || null;

    // Check if transaction has met the confirmation threshold
    const isConfirmed = txLedger ? await checkConfirmationStatus(txLedger) : false;
    const confirmationStatus = isConfirmed ? 'confirmed' : 'pending_confirmation';

    // Detect memo collision before recording
    const collision = await detectMemoCollision(memo, senderAddress, paymentAmount, student.feeAmount, txDate);

    // Aggregate all previous payments for this student
    const previousPayments = await Payment.aggregate([
      { $match: { studentId: memo } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const previousTotal = previousPayments.length ? previousPayments[0].total : 0;
    const cumulativeTotal = parseFloat((previousTotal + paymentAmount).toFixed(7));
    const remaining = parseFloat((student.feeAmount - cumulativeTotal).toFixed(7));

    // Determine cumulative validation status
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
    // Validate payment amount against the intent expected amount
    const feeValidation = validatePaymentAgainstFee(paymentAmount, intent.amount);

    await Payment.create({
      studentId: intent.studentId,
      txHash: tx.hash,
      amount: paymentAmount,
      feeAmount: student.feeAmount,
      feeValidationStatus: cumulativeStatus,
      excessAmount,
      feeAmount: intent.amount,
      feeValidationStatus: feeValidation.status,
      excessAmount: feeValidation.excessAmount,
      status: 'confirmed',
      memo,
      senderAddress,
      isSuspicious: collision.suspicious,
      suspicionReason: collision.reason,
      ledger: txLedger,
      confirmationStatus,
      confirmedAt: txDate,
    });

    // Only update student balance if payment is confirmed and not suspicious
    if (isConfirmed && !collision.suspicious) {
      await Student.findOneAndUpdate(
        { studentId: memo },
        {
          totalPaid: cumulativeTotal,
          remainingBalance: remaining < 0 ? 0 : remaining,
          feePaid: cumulativeTotal >= student.feeAmount,
        }
      );
    }
    // Update student's running totals
    await Student.findOneAndUpdate(
      { studentId: memo },
      {
        totalPaid: cumulativeTotal,
        remainingBalance: remaining < 0 ? 0 : remaining,
        feePaid: cumulativeTotal >= student.feeAmount,
      }
    );
    // Mark intent as completed
    await PaymentIntent.findByIdAndUpdate(intent._id, { status: 'completed' });

    // Only mark as paid if the payment meets or exceeds the required fee
    if (feeValidation.status === 'valid' || feeValidation.status === 'overpaid') {
      await Student.findOneAndUpdate({ studentId: intent.studentId }, { feePaid: true });
    }
  }
}

/**
 * Persist a payment record, enforcing uniqueness on txHash.
 * Returns the saved document, or throws DUPLICATE_TX if already recorded.
 */
async function recordPayment(data) {
  const exists = await Payment.findOne({ txHash: data.txHash });
  if (exists) {
    const err = new Error(`Transaction ${data.txHash} has already been processed`);
    err.code = 'DUPLICATE_TX';
    throw err;
  }
  try {
    return await Payment.create(data);
  } catch (e) {
    // Catch race-condition duplicate key errors from MongoDB
    if (e.code === 11000) {
      const err = new Error(`Transaction ${data.txHash} has already been processed`);
      err.code = 'DUPLICATE_TX';
      throw err;
    }
    throw e;
  }
}

// Verify a single transaction hash against the school wallet
async function verifyTransaction(txHash) {
  const tx = await server.transactions().transaction(txHash).call();

  const valid = await extractValidPayment(tx);
  if (!valid) return null;

  const { payOp, memo, asset } = valid;
  const amount = parseFloat(payOp.amount);

  const student = await Student.findOne({ studentId: memo });
  const feeAmount = student ? student.feeAmount : null;
  const feeValidation = feeAmount != null
    ? validatePaymentAgainstFee(amount, feeAmount)
    : { status: 'unknown', message: 'Student not found, cannot validate fee' };

  return {
    hash: tx.hash,
    memo,
    amount,
    assetCode: asset.assetCode,
    assetType: asset.assetType,
    feeAmount,

  // 1. Validate transaction success status
  if (tx.successful === false) {
    const err = new Error('Transaction was not successful on the Stellar network');
    err.code = 'TX_FAILED';
    throw err;
  }

  // 2. Extract and validate memo (student ID)
  const memo = tx.memo ? tx.memo.trim() : null;
  if (!memo) {
    const err = new Error('Transaction memo is missing or empty — cannot identify student');
    err.code = 'MISSING_MEMO';
    throw err;
  }

  // 3. Confirm a payment operation exists and destination matches school wallet
  const ops = await tx.operations();
  const payOp = ops.records.find(op => op.type === 'payment' && op.to === SCHOOL_WALLET);
  if (!payOp) {
    const err = new Error(`No payment operation found targeting the school wallet (${SCHOOL_WALLET})`);
    err.code = 'INVALID_DESTINATION';
    throw err;
  }

  // 4. Validate asset type
  const asset = detectAsset(payOp);
  if (!asset) {
    const assetCode = payOp.asset_type === 'native' ? 'XLM' : (payOp.asset_code || payOp.asset_type);
    const err = new Error(`Unsupported asset: ${assetCode}`);
    err.code = 'UNSUPPORTED_ASSET';
    err.assetCode = assetCode;
    throw err;
  }

  const amount = normalizeAmount(payOp.amount);

  // Find corresponding intent
  const intent = await PaymentIntent.findOne({ memo: tx.memo });
  if (!intent) return { hash: tx.hash, error: 'no_matching_intent', message: 'No pending payment intent found for this memo' };

  const student = await Student.findOne({ studentId: intent.studentId });
  const feeValidation = validatePaymentAgainstFee(amount, intent.amount);

  return {
    hash: tx.hash,
    memo: tx.memo,
    intentId: intent._id,
    studentId: intent.studentId,
    amount,
    expectedAmount: intent.amount,
    feeValidation,
    date: tx.created_at,
  };
}

/**
 * Check whether a transaction has met the confirmation threshold.
 * Fetches the latest ledger sequence and compares it against the tx ledger.
 * @param {number} txLedger - the ledger sequence the transaction was included in
 * @returns {Promise<boolean>}
 */
async function checkConfirmationStatus(txLedger) {
  const latestLedger = await server.ledgers().order('desc').limit(1).call();
  const latestSequence = latestLedger.records[0].sequence;
  return (latestSequence - txLedger) >= CONFIRMATION_THRESHOLD;
}

/**
 * Detect memo collision: same memo used by a different sender within a time window,
 * or payment amount doesn't match the student's expected fee at all.
 * @param {string} memo - the student ID used as memo
 * @param {string} senderAddress - the Stellar address that sent this payment
 * @param {number} paymentAmount - amount sent in this transaction
 * @param {number} expectedFee - the student's required fee
 * @param {Date} txDate - timestamp of this transaction
 * @returns {{ suspicious: boolean, reason: string|null }}
 */
async function detectMemoCollision(memo, senderAddress, paymentAmount, expectedFee, txDate) {
  const COLLISION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
  const windowStart = new Date(txDate.getTime() - COLLISION_WINDOW_MS);

  // Find recent payments for the same memo from a different sender
  const recentFromOtherSender = await Payment.findOne({
    studentId: memo,
    senderAddress: { $ne: senderAddress, $ne: null },
    confirmedAt: { $gte: windowStart },
  });

  if (recentFromOtherSender) {
    return {
      suspicious: true,
      reason: `Memo "${memo}" was used by a different sender (${recentFromOtherSender.senderAddress}) within the last 24 hours`,
    };
  }

  // Flag if amount is wildly off — not a round installment and not matching fee at all
  // (secondary validation: amount should be > 0 and not exceed fee by more than 2x)
  if (paymentAmount <= 0 || paymentAmount > expectedFee * 2) {
    return {
      suspicious: true,
      reason: `Unusual payment amount ${paymentAmount} for expected fee ${expectedFee}`,
    };
  }

  return { suspicious: false, reason: null };
}

/**
 * Validate a payment amount against the expected fee.
 * @param {number} paymentAmount — the amount actually paid
 * @param {number} expectedFee — the fee the student owes
 * @returns {{ status: string, excessAmount: number, message: string }}
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
 * Re-check all pending_confirmation payments and promote them to confirmed
 * once the ledger threshold has been met. Updates student balance on promotion.
 */
async function finalizeConfirmedPayments() {
  const pending = await Payment.find({ confirmationStatus: 'pending_confirmation', isSuspicious: false });

  for (const payment of pending) {
    if (!payment.ledger) continue;

    const isConfirmed = await checkConfirmationStatus(payment.ledger);
    if (!isConfirmed) continue;

    await Payment.findByIdAndUpdate(payment._id, { confirmationStatus: 'confirmed' });

    // Recalculate and update student balance now that this payment is confirmed
    const student = await Student.findOne({ studentId: payment.studentId });
    if (!student) continue;

    const agg = await Payment.aggregate([
      { $match: { studentId: payment.studentId, confirmationStatus: 'confirmed', isSuspicious: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalPaid = agg.length ? parseFloat(agg[0].total.toFixed(7)) : 0;
    const remainingBalance = parseFloat(Math.max(0, student.feeAmount - totalPaid).toFixed(7));

    await Student.findOneAndUpdate(
      { studentId: payment.studentId },
      {
        totalPaid,
        remainingBalance,
        feePaid: totalPaid >= student.feeAmount,
      }
    );
  }
}

module.exports = { syncPayments, verifyTransaction, validatePaymentAgainstFee, detectMemoCollision, finalizeConfirmedPayments, checkConfirmationStatus };
module.exports = { syncPayments, verifyTransaction, validatePaymentAgainstFee, detectMemoCollision };
module.exports = { syncPayments, verifyTransaction, validatePaymentAgainstFee, detectAsset, normalizeAmount, extractValidPayment };
module.exports = { syncPayments, verifyTransaction, validatePaymentAgainstFee, recordPayment };
