"use strict";

const {
  server,
  isAcceptedAsset,
  CONFIRMATION_THRESHOLD,
} = require("../config/stellarConfig");
const Payment = require("../models/paymentModel");
const Student = require("../models/studentModel");
const PaymentIntent = require("../models/paymentIntentModel");
const { validatePaymentAmount } = require("../utils/paymentLimits");
const { generateReferenceCode } = require("../utils/generateReferenceCode");
const { withStellarRetry } = require("../utils/withStellarRetry");
const logger = require("../utils/logger").child("StellarService");

function detectAsset(payOp) {
  const assetType = payOp.asset_type;
  const assetCode = assetType === "native" ? "XLM" : payOp.asset_code;
  const assetIssuer = assetType === "native" ? null : payOp.asset_issuer;
'use strict';

const { server, isAcceptedAsset, CONFIRMATION_THRESHOLD } = require('../config/stellarConfig');
const Payment = require('../models/paymentModel');
const Student = require('../models/studentModel');
const PaymentIntent = require('../models/paymentIntentModel');
const FeeStructure = require('../models/feeStructureModel');
const { feeEngine } = require('./feeAdjustmentEngine');        // ← Dynamic Fee Engine
const SourceValidationRule = require('../models/sourceValidationRuleModel');

const { validatePaymentAmount } = require('../utils/paymentLimits');
const SystemConfig = require('../models/systemConfigModel');
const { generateReferenceCode } = require('../utils/generateReferenceCode');
const { withStellarRetry } = require('../utils/withStellarRetry');
const { decryptMemo } = require('../utils/memoEncryption');
const logger = require('../utils/logger').child('StellarService');
const StellarSdk = require('@stellar/stellar-sdk');

function detectAsset(payOp) {
  const assetType = payOp.asset_type;
  const assetCode = assetType === 'native' ? 'XLM' : payOp.asset_code;
  const { accepted } = isAcceptedAsset(assetCode, assetType);
  if (!accepted) return null;
  return { 
    assetCode, 
    assetType, 
    assetIssuer: payOp.asset_issuer 
  };
}

function normalizeAmount(rawAmount) {
  return parseFloat(parseFloat(rawAmount).toFixed(7));
}

/**
 * Calculate dynamic adjusted fee using the Fee Adjustment Engine (#74)
 */
async function extractValidPayment(tx, walletAddress) {
  if (!tx.successful) return null;

  const rawMemo = tx.memo ? tx.memo.trim() : null;
  if (!rawMemo) return null;

  const ops = await withStellarRetry(() => tx.operations(), {
    label: "extractValidPayment.operations",
  });
  const payOp = ops.records.find(
    (op) => op.type === "payment" && op.to === walletAddress,
  );
  if (!payOp) return null;
  const memo = decryptMemo(rawMemo);
async function getAdjustedFee(student, intentAmount, paymentDate, schoolId) {
  const feeStructure = await FeeStructure.findOne({
    schoolId,
    className: student.class || student.className,
    academicYear: student.academicYear
  });

  const baseFee = feeStructure ? feeStructure.feeAmount : (student.feeAmount || intentAmount || 0);

  const context = {
    userId: student._id || student.studentId,
    userType: 'student',
    baseAmount: baseFee,
    paymentType: 'course',
    isEarly: false,                    // You can enhance this logic later
    isLate: false,                     // You can enhance this logic later
    totalPaymentsThisMonth: 0,         // You can compute this if needed
    promoCode: null,
    timestamp: paymentDate || new Date(),
  };

  const result = feeEngine.calculateFee(context);

function validatePaymentAgainstFee(paymentAmount, expectedFee) {
  if (paymentAmount < expectedFee) {
    return {
      status: "underpaid",
      excessAmount: 0,
      message: `Payment of ${paymentAmount} is less than the required fee of ${expectedFee}`,
    };
  }
  if (paymentAmount > expectedFee) {
    const excess = parseFloat((paymentAmount - expectedFee).toFixed(7));
    return {
      status: "overpaid",
      excessAmount: excess,
      message: `Payment of ${paymentAmount} exceeds the required fee of ${expectedFee} by ${excess}`,
    };
  }
  return {
    status: "valid",
    excessAmount: 0,
    message: "Payment matches the required fee",
  return {
    baseFee: result.baseFee,
    finalFee: result.finalFee,
    adjustmentsApplied: result.adjustments
  };
}

async function checkConfirmationStatus(txLedger) {
  const latestLedger = await withStellarRetry(
    () => server.ledgers().order("desc").limit(1).call(),
    { label: "checkConfirmationStatus" },
  );
  const latestSequence = latestLedger.records[0].sequence;
  return latestSequence - txLedger >= CONFIRMATION_THRESHOLD;
  return (latestSequence - txLedger) >= CONFIRMATION_THRESHOLD;
/**
 * Parse an incoming Stellar transaction for memo and payment amounts.
 * If walletAddress is provided, only payments to that wallet are included.
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

/**
 * Detect memo collision: same memo used by a different sender within 24h,
 * or payment amount is wildly outside the expected fee range.
 * Query is school-scoped via schoolId.
 * Validate payment amount against final adjusted fee
 */
async function detectMemoCollision(
  memo,
  senderAddress,
  paymentAmount,
  expectedFee,
  txDate,
  schoolId,
) {
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
      reason:
        'Memo "' +
        memo +
        '" was used by a different sender (' +
        recentFromOtherSender.senderAddress +
        ") within the last 24 hours",
function validatePaymentAgainstFee(paymentAmount, finalFee) {
  if (paymentAmount < finalFee * 0.99) {
    return { 
      status: 'underpaid', 
      excessAmount: 0, 
      message: `Underpaid: ${paymentAmount} < ${finalFee}` 
    };
  }
  if (paymentAmount > finalFee * 1.01) {
    const excess = parseFloat((paymentAmount - finalFee).toFixed(7));
    return { 
      status: 'overpaid', 
      excessAmount: excess, 
      message: `Overpaid by ${excess}` 
    };
  }
  return { 
    status: 'valid', 
    excessAmount: 0, 
    message: 'Payment matches final fee' 
  };
}

/**
 * Extract valid payment operation from transaction
 */
async function detectAbnormalPatterns(
  senderAddress,
  paymentAmount,
  expectedFee,
  txDate,
  schoolId,
) {
  const RAPID_TX_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const RAPID_TX_LIMIT = 3; // more than this many = suspicious
  const UNUSUAL_AMOUNT_MULTIPLIER = 3; // >3× or <1/3 of expected fee
async function extractValidPayment(tx, walletAddress) {
  if (!tx.successful) return null;

  const memo = tx.memo ? tx.memo.trim() : null;
  if (!memo) return null;

  // 1. Velocity check — rapid repeated transactions from the same sender
  if (senderAddress) {
    const windowStart = new Date(txDate.getTime() - RAPID_TX_WINDOW_MS);
    const recentCount = await Payment.countDocuments({
      schoolId,
      senderAddress,
      confirmedAt: { $gte: windowStart },
    });
    if (recentCount >= RAPID_TX_LIMIT) {
      reasons.push(
        `Sender ${senderAddress} made ${
          recentCount + 1
        } transactions within 10 minutes`,
      );
    }
  }

  // 2. Unusual amount check
  if (expectedFee && expectedFee > 0) {
    const ratio = paymentAmount / expectedFee;
    if (
      ratio > UNUSUAL_AMOUNT_MULTIPLIER ||
      ratio < 1 / UNUSUAL_AMOUNT_MULTIPLIER
    ) {
      reasons.push(
        `Unusual payment amount ${paymentAmount} vs expected fee ${expectedFee} (ratio ${ratio.toFixed(
          2,
        )})`,
      );
    }
  }

  if (reasons.length > 0) {
    return { suspicious: true, reason: reasons.join("; ") };
  }
  return { suspicious: false, reason: null };
  const ops = await tx.operations();
  const payOp = ops.records.find(op => op.type === 'payment' && op.to === walletAddress);
  if (!payOp) return null;

  const asset = detectAsset(payOp);
  if (!asset) return null;

  return { payOp, memo, asset };
}

/**
 * Source account validation (Issue #75)
 */
async function recordPayment(data) {
  const exists = await Payment.findOne({
    transactionHash: data.transactionHash,
  });
  if (exists) {
    const err = new Error(
      `Transaction ${data.transactionHash} has already been processed`,
    );
    err.code = "DUPLICATE_TX";
    throw err;
  }
  if (!data.referenceCode) {
    data = { ...data, referenceCode: await generateReferenceCode() };
  }
  try {
    return await Payment.create(data);
  } catch (e) {
    if (e.code === 11000) {
      const err = new Error(
        `Transaction ${data.transactionHash} has already been processed`,
      );
      err.code = "DUPLICATE_TX";
      logger.warn("Duplicate transaction rejected", {
        txHash: data.transactionHash,
        schoolId: data.schoolId,
      });
      throw err;
    }
    logger.error("Failed to record payment", {
      error: e.message,
      txHash: data.transactionHash,
      schoolId: data.schoolId,
    });
    throw e;
async function validateSourceAccount(sourceAccount, schoolId, txDate) {
  if (!sourceAccount) {
    return { valid: false, suspicious: true, reason: 'Missing source account' };
  }

  const rules = await SourceValidationRule.find({ isActive: true }).sort({ priority: 1 });

  for (const rule of rules) {
    switch (rule.type) {
      case 'blacklist':
        if (rule.value === sourceAccount) {
          return { valid: false, suspicious: true, reason: `Blacklisted source: ${sourceAccount}` };
        }
        break;

      case 'whitelist':
        if (rule.value !== sourceAccount) {
          return { valid: false, suspicious: true, reason: 'Source account not whitelisted' };
        }
        break;

      case 'new_sender_limit':
        const dayStart = new Date(txDate);
        dayStart.setHours(0, 0, 0, 0);
        const count = await Payment.countDocuments({
          schoolId,
          senderAddress: sourceAccount,
          createdAt: { $gte: dayStart }
        });
        if (count >= (rule.maxTransactionsPerDay || 5)) {
          return { valid: false, suspicious: true, reason: `New sender exceeded daily limit` };
        }
        break;
    }
  }

  return { valid: true, suspicious: false, reason: null };
}

/**
 * Verify a single transaction hash against a specific school wallet.
 * Throws structured errors for all failure cases so the controller can handle them uniformly.
 *
 * @param {string} txHash        - 64-char hex transaction hash
 * @param {string} walletAddress - the school's Stellar wallet address
 * @returns {object|null} Verified transaction details, or null if no valid payment found
 */
async function checkConfirmationStatus(txLedger) {
  const latestLedger = await server.ledgers().order('desc').limit(1).call();
  const latestSequence = latestLedger.records[0].sequence;
  return (latestSequence - txLedger) >= CONFIRMATION_THRESHOLD;
}

/* ====================== MAIN FUNCTIONS ====================== */

async function verifyTransaction(txHash, walletAddress) {
  const tx = await withStellarRetry(
    () => server.transactions().transaction(txHash).call(),
    { label: "verifyTransaction" },
  );

  // 1. Validate transaction success
  if (tx.successful === false) {
    const err = new Error(
      "Transaction was not successful on the Stellar network",
    );
    err.code = "TX_FAILED";
    throw err;
  }

  const memo = tx.memo ? tx.memo.trim() : null;
  if (!memo) {
    const err = new Error(
      "Transaction memo is missing or empty — cannot identify student",
    );
    err.code = "MISSING_MEMO";
  if (!tx.successful) {
    throw Object.assign(new Error('Transaction failed'), { code: 'TX_FAILED' });
  }

  const rawMemo = tx.memo ? tx.memo.trim() : null;
  if (!rawMemo) {
    const err = new Error('Transaction memo is missing or empty — cannot identify student');
    err.code = 'MISSING_MEMO';
    throw err;
  const memo = tx.memo ? tx.memo.trim() : null;
  if (!memo) {
    throw Object.assign(new Error('Missing memo'), { code: 'MISSING_MEMO' });
  }

  const ops = await withStellarRetry(() => tx.operations(), {
    label: "verifyTransaction.operations",
  });
  const payOp = ops.records.find(
    (op) => op.type === "payment" && op.to === walletAddress,
  );
  if (!payOp) {
    const err = new Error(
      `No payment operation found targeting the school wallet (${walletAddress})`,
    );
    err.code = "INVALID_DESTINATION";
    throw err;
  const memo = decryptMemo(rawMemo);

  const ops = await tx.operations();
  const payOp = ops.records.find(op => op.type === 'payment' && op.to === walletAddress);
  if (!payOp) {
    throw Object.assign(new Error('Invalid destination'), { code: 'INVALID_DESTINATION' });
  }

  const sourceAccount = payOp.from;
  const amount = normalizeAmount(payOp.amount);

  // Source validation (#75)
  const sourceValidation = await validateSourceAccount(sourceAccount, null, new Date(tx.created_at));
  if (!sourceValidation.valid) {
    throw Object.assign(new Error(sourceValidation.reason), { code: 'INVALID_SOURCE' });
  }

  const asset = detectAsset(payOp);
  if (!asset) {
    const assetCode =
      payOp.asset_type === "native"
        ? "XLM"
        : payOp.asset_code || payOp.asset_type;
    const err = new Error(`Unsupported asset: ${assetCode}`);
    err.code = "UNSUPPORTED_ASSET";
    err.assetCode = assetCode;
    throw err;
    throw Object.assign(new Error('Unsupported asset'), { code: 'UNSUPPORTED_ASSET' });
  }

  const limitValidation = validatePaymentAmount(amount);
  if (!limitValidation.valid) {
    throw Object.assign(new Error(limitValidation.error), { code: limitValidation.code });
  }

  const student = await Student.findOne({ studentId: memo });
  const feeAmount = student ? student.feeAmount : null;

  const feeValidation =
    feeAmount != null
      ? validatePaymentAgainstFee(amount, feeAmount)
      : {
          status: "unknown",
          excessAmount: 0,
          message: "Student not found, cannot validate fee",
        };

  // Extract network fee from transaction
  const networkFee = parseFloat(tx.fee_paid || "0") / 10000000; // Convert stroops to XLM
  if (!student) {
    return { status: 'unknown_student', memo, amount };
  }

  const txDate = new Date(tx.created_at);
  const { baseFee, finalFee, adjustmentsApplied } = await getAdjustedFee(
    student, 
    student.feeAmount, 
    txDate, 
    student.schoolId
  );

  const feeValidation = validatePaymentAgainstFee(amount, finalFee);

  return {
    hash: tx.hash,
    memo,
    studentId: memo,
    amount,
    assetCode: asset.assetCode,
    baseFee,
    finalFee,
    adjustmentsApplied,
    sourceAccount,
    sourceValidation,
    feeValidation,
    date: tx.created_at,
    senderAddress: sourceAccount
  };
}

async function syncPaymentsForSchool(school) {
  const { schoolId, stellarAddress } = school;

  const transactions = await withStellarRetry(
    () =>
      server
        .transactions()
        .forAccount(stellarAddress)
        .order("desc")
        .limit(20)
        .call(),
    { label: `syncPaymentsForSchool(${schoolId})` },
  );
  const transactions = await server.transactions()
    .forAccount(stellarAddress)
    .order('desc')
    .limit(20)
    .call();

  for (const tx of transactions.records) {
    if (await Payment.findOne({ txHash: tx.hash })) continue;

    // Detect failed on-chain transactions and record them with FAILED status
    if (tx.successful === false) {
      const memo = tx.memo ? tx.memo.trim() : null;
      await Payment.create({
        schoolId,
        studentId: memo || "unknown",
        txHash: tx.hash,
        transactionHash: tx.hash,
        amount: 0,
        status: "FAILED",
        memo: memo || null,
        feeValidationStatus: "unknown",
        confirmationStatus: "failed",
        confirmedAt: tx.created_at ? new Date(tx.created_at) : new Date(),
        suspicionReason: "Transaction failed on the Stellar network",
      }).catch((e) => {
        if (e.code !== 11000)
          logger.error("Failed to record failed tx", {
            txHash: tx.hash,
            error: e.message,
          });
      });
      logger.warn("Recorded failed on-chain transaction", {
        txHash: tx.hash,
        schoolId,
      });
      continue;
    }

    const valid = await extractValidPayment(tx, stellarAddress);
    if (!valid) continue;

    const { payOp, memo } = valid;

    const intent = await PaymentIntent.findOne({
      schoolId,
      memo,
      status: "pending",
    });
    const intent = await PaymentIntent.findOne({ schoolId, memo, status: 'pending' });
    if (!intent) continue;

    const student = await Student.findOne({
      schoolId,
      studentId: intent.studentId,
    });
    if (!student) continue;

    const paymentAmount = parseFloat(payOp.amount);
    const senderAddress = payOp.from || null;
    const txDate = new Date(tx.created_at);
    const txLedger = tx.ledger_attr || tx.ledger || null;

    // Source validation (#75)
    const sourceValidation = await validateSourceAccount(senderAddress, schoolId, txDate);
    if (!sourceValidation.valid) {
      console.warn(`[Source Validation] Rejected tx ${tx.hash}: ${sourceValidation.reason}`);
      continue;
    }

    const senderAddress = payOp.from || null;
    const txDate = new Date(tx.created_at);
    const txLedger = tx.ledger_attr || tx.ledger || null;
    const isConfirmed = txLedger
      ? await checkConfirmationStatus(txLedger)
      : false;
    const confirmationStatus = isConfirmed
      ? "confirmed"
      : "pending_confirmation";

    const collision = await detectMemoCollision(
      memo,
      senderAddress,
      paymentAmount,
      student.feeAmount,
      txDate,
      schoolId,
    );

    const previousPayments = await Payment.aggregate([
      { $match: { schoolId, studentId: intent.studentId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const previousTotal = previousPayments.length
      ? previousPayments[0].total
    // Dynamic Fee Calculation (#74)
    const { baseFee, finalFee, adjustmentsApplied } = await getAdjustedFee(
      student, 
      intent.amount, 
      txDate, 
      schoolId
    );

    const limitValidation = validatePaymentAmount(paymentAmount);
    if (!limitValidation.valid) continue;

    const isConfirmed = txLedger ? await checkConfirmationStatus(txLedger) : false;
    const confirmationStatus = isConfirmed ? 'confirmed' : 'pending_confirmation';

    const [collision, abnormal] = await Promise.all([
      detectMemoCollision(student._id, senderAddress, paymentAmount, finalFee, txDate, schoolId),
      detectAbnormalPatterns(senderAddress, paymentAmount, finalFee, txDate, schoolId)
    ]);

    const isSuspicious = collision.suspicious || abnormal.suspicious || sourceValidation.suspicious;
    const suspicionReason = [collision.reason, abnormal.reason, sourceValidation.reason]
      .filter(Boolean).join('; ') || null;

    const agg = await Payment.aggregate([
      { $match: { schoolId, studentId: student._id, status: 'SUCCESS' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const previousTotal = agg.length ? agg[0].total : 0;
    const cumulativeTotal = parseFloat((previousTotal + paymentAmount).toFixed(7));
    const remainingBalance = Math.max(0, parseFloat((finalFee - cumulativeTotal).toFixed(7)));

    const cumulativeStatus = cumulativeTotal < finalFee ? 'underpaid' 
                          : cumulativeTotal > finalFee ? 'overpaid' 
                          : 'valid';

    const excessAmount = cumulativeStatus === 'overpaid' 
      ? parseFloat((cumulativeTotal - finalFee).toFixed(7)) 
      : 0;
    const cumulativeTotal = parseFloat(
      (previousTotal + paymentAmount).toFixed(7),
    );
    const remaining = parseFloat(
      (student.feeAmount - cumulativeTotal).toFixed(7),
    );

    let cumulativeStatus;
    if (cumulativeTotal < student.feeAmount) cumulativeStatus = "underpaid";
    else if (cumulativeTotal > student.feeAmount) cumulativeStatus = "overpaid";
    else cumulativeStatus = "valid";

    const excessAmount =
      cumulativeStatus === "overpaid"
        ? parseFloat((cumulativeTotal - student.feeAmount).toFixed(7))
        : 0;

    const feeValidation = validatePaymentAgainstFee(
      paymentAmount,
      intent.amount,
    );

    // Skip underpaid single payments — record them as flagged but do not credit
    if (feeValidation.status === "underpaid") {
      logger.warn("Underpaid transaction skipped", {
        txHash: tx.hash,
        schoolId,
        studentId: intent.studentId,
        paid: paymentAmount,
        required: intent.amount,
      });
      await Payment.create({
        schoolId,
        studentId: intent.studentId,
        txHash: tx.hash,
        amount: paymentAmount,
        feeAmount: intent.amount,
        feeValidationStatus: "underpaid",
        excessAmount: 0,
        status: "FAILED",
        memo,
        senderAddress,
        isSuspicious: true,
        suspicionReason: feeValidation.message,
        ledger: txLedger,
        confirmationStatus: "failed",
        confirmedAt: txDate,
      });
      continue;
    }
    const feeValidation = validatePaymentAgainstFee(paymentAmount, finalFee);

    await Payment.create({
      schoolId,
      studentId: student._id,
      studentIdStr: intent.studentId,
      txHash: tx.hash,
      amount: paymentAmount,
      baseFee,
      finalFee,
      adjustmentsApplied,
      feeValidationStatus: cumulativeStatus,
      excessAmount,
      status: "confirmed",
      status: 'SUCCESS',
      memo,
      senderAddress,
      isSuspicious,
      suspicionReason,
      ledger: txLedger,
      ledgerSequence: txLedger,
      confirmationStatus,
      confirmedAt: txDate,
      referenceCode: await generateReferenceCode()
    });

    logger.info("Transaction recorded", {
      txHash: tx.hash,
      schoolId,
      studentId: intent.studentId,
      amount: paymentAmount,
      feeValidationStatus: cumulativeStatus,
      isSuspicious: collision.suspicious,
      confirmationStatus,
    });

    if (
      isConfirmed &&
      !collision.suspicious &&
      typeof Student.findOneAndUpdate === "function"
    ) {
      await Student.findOneAndUpdate(
        { schoolId, studentId: intent.studentId },
        {
          totalPaid: cumulativeTotal,
          remainingBalance,
          feePaid: cumulativeTotal >= student.feeAmount,
        },
      );
    }

    await PaymentIntent.findByIdAndUpdate(intent._id, { status: "completed" });
    if (isConfirmed && !isSuspicious) {
      await Student.findOneAndUpdate(
        { schoolId, studentId: intent.studentId },
        { 
          totalPaid: cumulativeTotal, 
          remainingBalance, 
          feePaid: cumulativeTotal >= finalFee 
        }
      );
    }

    await PaymentIntent.findByIdAndUpdate(intent._id, { status: 'completed' });

    if (['valid', 'overpaid'].includes(feeValidation.status)) {
      await Student.findOneAndUpdate(
        { schoolId, studentId: intent.studentId }, 
        { feePaid: true }
      );
    }
  }
}

async function finalizeConfirmedPayments(schoolId) {
  const pending = await Payment.find({
    schoolId,
    confirmationStatus: "pending_confirmation",
    isSuspicious: false,
    confirmationStatus: 'pending_confirmation',
    isSuspicious: false
  });

  for (const payment of pending) {
    if (!payment.ledger) continue;
    const isConfirmed = await checkConfirmationStatus(payment.ledger);
    if (!isConfirmed) continue;

    if (typeof Payment.findByIdAndUpdate === "function") {
      await Payment.findByIdAndUpdate(payment._id, {
        confirmationStatus: "confirmed",
      });
    }

    const student = await Student.findOne({
      schoolId,
      studentId: payment.studentId,
    });
    if (!student) continue;

    const agg = await Payment.aggregate([
      {
        $match: {
          schoolId,
          studentId: payment.studentId,
          confirmationStatus: "confirmed",
          isSuspicious: false,
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    await Payment.findByIdAndUpdate(payment._id, { confirmationStatus: 'confirmed' });

    const student = await Student.findOne({ schoolId, studentId: payment.studentIdStr });
    if (!student) continue;

    const agg = await Payment.aggregate([
      { $match: { schoolId, studentId: payment.studentId, confirmationStatus: 'confirmed', isSuspicious: false } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalPaid = agg.length ? parseFloat(agg[0].total.toFixed(7)) : 0;
    const remainingBalance = parseFloat(
      Math.max(0, student.feeAmount - totalPaid).toFixed(7),
    );

    await Student.findOneAndUpdate(
      { schoolId, studentId: payment.studentId },
      { totalPaid, remainingBalance, feePaid: totalPaid >= student.feeAmount },
    );
  }
}

    const remainingBalance = Math.max(0, parseFloat((payment.finalFee - totalPaid).toFixed(7)));

    await Student.findOneAndUpdate(
      { schoolId, studentId: payment.studentIdStr },
      { 
        totalPaid, 
        remainingBalance, 
        feePaid: totalPaid >= payment.finalFee 
      }
    );
  }
}

/**
 * Persist a payment record, enforcing uniqueness on txHash.
 * Throws DUPLICATE_TX if already recorded.
 * data must include schoolId.
 */
async function recordPayment(data) {
  const exists = await Payment.findOne({ transactionHash: data.transactionHash });
  if (exists) {
    const err = new Error(`Transaction ${data.transactionHash} has already been processed`);
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
      const err = new Error(`Transaction ${data.transactionHash} has already been processed`);
      err.code = 'DUPLICATE_TX';
      throw err;
    }
    throw err;
  }
}

async function getNextSequenceNumber(publicKey) {
  let config = await SystemConfig.findOne({ key: `seq_${publicKey}` });
  let nextSequence;

  if (config && config.value) {
    nextSequence = (BigInt(config.value) + 1n).toString();
  } else {
    const account = await server.loadAccount(publicKey);
    nextSequence = (BigInt(account.sequenceNumber()) + 1n).toString();
  }
  
  await SystemConfig.findOneAndUpdate(
    { key: `seq_${publicKey}` },
    { value: nextSequence },
    { upsert: true }
  );
  
  return nextSequence;
}

module.exports = {
  syncPaymentsForSchool,
  verifyTransaction,
  parseIncomingTransaction,
  validatePaymentAgainstFee,
  extractValidPayment,
  detectAsset,
  normalizeAmount,
  checkConfirmationStatus,
  recordPayment,
};
  getNextSequenceNumber
  finalizeConfirmedPayments,
  validatePaymentAgainstFee,
  getAdjustedFee,                 // exported for potential external use
};
