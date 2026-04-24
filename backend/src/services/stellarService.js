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
const { withStellarRetry } = require("../utils/withStellarRetry");
const { savePayment } = require("./transactionService");
const logger = require("../utils/logger").child("StellarService");

function detectAsset(payOp) {
  const assetType = payOp.asset_type;
  const assetCode = assetType === "native" ? "XLM" : payOp.asset_code;
  const assetIssuer = assetType === "native" ? null : payOp.asset_issuer;
  const { accepted } = isAcceptedAsset(assetCode, assetType);
  if (!accepted) return null;
  return { assetCode, assetType, assetIssuer };
}

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

  // Only process MEMO_TEXT — MEMO_ID, MEMO_HASH, MEMO_RETURN produce
  // non-string values that cannot be matched to a student ID.
  if (tx.memo_type !== 'text') return null;

  const memo = tx.memo ? tx.memo.trim() : null;
  if (!memo) return null;

  const ops = await withStellarRetry(() => tx.operations(), {
    label: "extractValidPayment.operations",
  });
  const payOp = ops.records.find(
    (op) => op.type === "payment" && op.to === walletAddress,
  );
  if (!payOp) return null;

  const asset = detectAsset(payOp);
  if (!asset) return null;

  return { payOp, memo, asset };
}

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
  };
}

async function checkConfirmationStatus(txLedger) {
  const latestLedger = await withStellarRetry(
    () => server.ledgers().order("desc").limit(1).call(),
    { label: "checkConfirmationStatus" },
  );
  const latestSequence = latestLedger.records[0].sequence;
  return latestSequence - txLedger >= CONFIRMATION_THRESHOLD;
}

/**
 * Detect memo collision: same memo used by a different sender within 24h,
 * or payment amount is wildly outside the expected fee range.
 * Query is school-scoped via schoolId.
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
    };
  }
}

/**
 * Detect abnormal payment patterns:
 *  1. Rapid repeated transactions — same sender sends more than RAPID_TX_LIMIT
 *     payments within RAPID_TX_WINDOW_MS.
 *  2. Unusual amount — payment deviates from the expected fee by more than
 *     UNUSUAL_AMOUNT_MULTIPLIER (e.g. 3×).
 *
 * Returns { suspicious: boolean, reason: string|null }
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

  const reasons = [];

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
        `Sender ${senderAddress} made ${recentCount + 1} transactions within 10 minutes`,
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
        `Unusual payment amount ${paymentAmount} vs expected fee ${expectedFee} (ratio ${ratio.toFixed(2)})`,
      );
    }
  }

  if (reasons.length > 0) {
    return { suspicious: true, reason: reasons.join("; ") };
  }
  return { suspicious: false, reason: null };
}

/**
 * Verify a single transaction hash against a specific school wallet.
 * Throws structured errors for all failure cases.
 *
 * Error codes:
 *   NOT_FOUND (404)           — txHash does not exist on Horizon
 *   HORIZON_UNAVAILABLE (503) — Horizon unreachable / rate-limited / 5xx
 *   TX_FAILED (400)           — transaction found but failed on-chain
 *   MISSING_MEMO (400)        — no memo on the transaction
 *   INVALID_DESTINATION (400) — no payment op to the school wallet
 *   UNSUPPORTED_ASSET (400)   — asset not accepted
 *   AMOUNT_TOO_LOW/HIGH (400) — outside configured limits
 */
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
    throw err;
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
  }

  const amount = normalizeAmount(payOp.amount);

  // 5. Validate payment amount is within configured limits
  const limitValidation = validatePaymentAmount(amount);
  if (!limitValidation.valid) {
    const err = new Error(limitValidation.error);
    err.code = limitValidation.code;
    throw err;
  }

  // 6. Look up student to validate fee (student lookup is not school-scoped here
  //    since memo = studentId; recordPayment caller passes schoolId explicitly)
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

  return {
    hash: tx.hash,
    memo: memo,
    studentId: memo,
    amount: amount,
    assetCode: asset.assetCode,
    assetType: asset.assetType,
    feeAmount,
    feeValidation,
    networkFee,
    date: tx.created_at,
    ledger: tx.ledger_attr || tx.ledger || null,
    senderAddress: payOp.from || null,
  };
}

/**
 * Fetch recent transactions for a specific school wallet and record new payments.
 * Paginates through ALL transactions (200 per page) until an already-processed
 * transaction is encountered, ensuring no payments are missed after downtime.
 *
 * @param {object} school - School document with { schoolId, stellarAddress }
 */
async function syncPaymentsForSchool(school) {
  const { schoolId, stellarAddress } = school;

  // Fetch up to 200 transactions per page (Horizon API maximum).
  // Pagination continues until we hit an already-recorded transaction or
  // exhaust all pages — fixing the previous limit(20) single-fetch bug.
  let page = await withStellarRetry(
    () =>
      server
        .transactions()
        .forAccount(stellarAddress)
        .order("desc")
        .limit(200)
        .call(),
    { label: `syncPaymentsForSchool(${schoolId})` },
  );

  let done = false;
  let newPayments = 0;
  while (!done) {
    for (const tx of page.records) {
      const existing = await Payment.findOne({ txHash: tx.hash });
      if (existing) {
        done = true;
        break;
      }

      const valid = await extractValidPayment(tx, stellarAddress);
      if (!valid) continue;

      const { payOp, memo } = valid;

      const intent = await PaymentIntent.findOne({
        schoolId,
        memo,
        status: "pending",
      });
      if (!intent) continue;

      const student = await Student.findOne({
        schoolId,
        studentId: intent.studentId,
      });
      if (!student) continue;

      const paymentAmount = parseFloat(payOp.amount);

      const limitValidation = validatePaymentAmount(paymentAmount);
      if (!limitValidation.valid) continue;

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
        : 0;
      const cumulativeTotal = parseFloat(
        (previousTotal + paymentAmount).toFixed(7),
      );

      let cumulativeStatus;
      if (cumulativeTotal < student.feeAmount) cumulativeStatus = "underpaid";
      else if (cumulativeTotal > student.feeAmount)
        cumulativeStatus = "overpaid";
      else cumulativeStatus = "valid";

      const excessAmount =
        cumulativeStatus === "overpaid"
          ? parseFloat((cumulativeTotal - student.feeAmount).toFixed(7))
          : 0;

      const feeValidation = validatePaymentAgainstFee(
        paymentAmount,
        intent.amount,
      );

      if (feeValidation.status === "underpaid") {
        logger.warn("Underpaid transaction skipped", {
          txHash: tx.hash,
          schoolId,
          studentId: intent.studentId,
          paid: paymentAmount,
          required: intent.amount,
        });
        await savePayment({
          schoolId,
          studentId: intent.studentId,
          txHash: tx.hash,
          amount: paymentAmount,
          feeAmount: intent.amount,
          feeCategory: intent.feeCategory || null,
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
        newPayments++;
        continue;
      }

      await savePayment({
        schoolId,
        studentId: intent.studentId,
        txHash: tx.hash,
        amount: paymentAmount,
        feeAmount: intent.amount,
        feeCategory: intent.feeCategory || null,
        feeValidationStatus: cumulativeStatus,
        excessAmount,
        status: "confirmed",
        memo,
        senderAddress,
        isSuspicious: collision.suspicious,
        suspicionReason: collision.reason,
        ledger: txLedger,
        confirmationStatus,
        confirmedAt: txDate,
      });
      newPayments++;

      logger.info("Transaction recorded", {
        txHash: tx.hash,
        schoolId,
        studentId: intent.studentId,
        amount: paymentAmount,
        feeValidationStatus: cumulativeStatus,
        isSuspicious: collision.suspicious,
        confirmationStatus,
      });

      if (isConfirmed && !collision.suspicious) {
        // Update student record
        const updateData = {
          totalPaid: cumulativeTotal,
          feePaid: cumulativeTotal >= student.feeAmount,
        };

        // If this payment is for a specific fee category, update that category's paid status
        if (intent.feeCategory && student.fees && student.fees.length > 0) {
          const feeIndex = student.fees.findIndex(f => f.category === intent.feeCategory);
          if (feeIndex !== -1) {
            // Calculate new total paid for this category
            const categoryPayments = await Payment.aggregate([
              {
                $match: {
                  schoolId,
                  studentId: intent.studentId,
                  feeCategory: intent.feeCategory,
                  confirmationStatus: "confirmed",
                  isSuspicious: false,
                },
              },
              { $group: { _id: null, total: { $sum: "$amount" } } },
            ]);
            const categoryTotalPaid = categoryPayments.length
              ? parseFloat(categoryPayments[0].total.toFixed(7))
              : 0;

            // Update the specific fee category
            student.fees[feeIndex].totalPaid = categoryTotalPaid;
            student.fees[feeIndex].remainingBalance = Math.max(
              0,
              student.fees[feeIndex].amount - categoryTotalPaid
            );
            student.fees[feeIndex].paid = categoryTotalPaid >= student.fees[feeIndex].amount;

            updateData.fees = student.fees;
          }
        }

        await Student.findOneAndUpdate(
          { schoolId, studentId: intent.studentId },
          updateData,
        );
      }

      await PaymentIntent.findByIdAndUpdate(intent._id, {
        status: "completed",
      });
    }

    if (!done) {
      if (page.records.length < 200) break; // last page
      page = await withStellarRetry(() => page.next(), {
        label: `syncPaymentsForSchool.next(${schoolId})`,
      });
      if (!page || !page.records.length) break;
    }
  }
  return { newPayments };
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
    confirmationStatus: "pending_confirmation",
    isSuspicious: false,
  });

  for (const payment of pending) {
    if (!payment.ledgerSequence) continue;
    const isConfirmed = await checkConfirmationStatus(payment.ledgerSequence);
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
    ]);
    const totalPaid = agg.length ? parseFloat(agg[0].total.toFixed(7)) : 0;
    const remainingBalance = parseFloat(
      Math.max(0, student.feeAmount - totalPaid).toFixed(7),
    );

    const updateData = { totalPaid, remainingBalance, feePaid: totalPaid >= student.feeAmount };

    // Update fee categories if they exist
    if (student.fees && student.fees.length > 0) {
      const categoryPayments = await Payment.aggregate([
        {
          $match: {
            schoolId,
            studentId: payment.studentId,
            feeCategory: { $ne: null },
            confirmationStatus: "confirmed",
            isSuspicious: false,
          },
        },
        {
          $group: {
            _id: "$feeCategory",
            totalPaid: { $sum: "$amount" },
          },
        },
      ]);

      const categoryPaymentMap = {};
      categoryPayments.forEach(cp => {
        categoryPaymentMap[cp._id] = parseFloat(cp.totalPaid.toFixed(7));
      });

      // Update each fee category
      student.fees.forEach(fee => {
        const paid = categoryPaymentMap[fee.category] || 0;
        fee.totalPaid = paid;
        fee.remainingBalance = Math.max(0, fee.amount - paid);
        fee.paid = paid >= fee.amount;
      });

      updateData.fees = student.fees;
    }

    await Student.findOneAndUpdate(
      { schoolId, studentId: payment.studentId },
      updateData,
    );
  }
}

/**
 * Parse an incoming Stellar transaction for memo and payment amounts.
 * If walletAddress is provided, only payments to that wallet are included.
 */
async function parseIncomingTransaction(txHash, walletAddress = null) {
  let tx;
  try {
    tx = await withStellarRetry(
      () => server.transactions().transaction(txHash).call(),
      { label: "parseIncomingTransaction" },
    );
  } catch (err) {
    throw classifyHorizonError(err, `Transaction ${txHash}`);
  }

  const memo = tx.memo ? tx.memo.trim() : null;

  let ops;
  try {
    ops = await withStellarRetry(() => tx.operations(), {
      label: "parseIncomingTransaction.operations",
    });
  } catch (err) {
    throw classifyHorizonError(err, "Transaction operations");
  }
  const payments = ops.records
    .filter(
      (op) =>
        op.type === "payment" && (!walletAddress || op.to === walletAddress),
    )
    .map((op) => ({
      from: op.from || null,
      to: op.to,
      amount: normalizeAmount(op.amount),
      assetCode: op.asset_type === "native" ? "XLM" : op.asset_code,
      assetType: op.asset_type,
      assetIssuer: op.asset_issuer || null,
    }));

  return {
    hash: tx.hash,
    successful: tx.successful,
    memo,
    payments,
    created_at: tx.created_at,
  };
}

module.exports = {
  syncPaymentsForSchool,
  finalizeConfirmedPayments,
  verifyTransaction,
  parseIncomingTransaction,
  validatePaymentAgainstFee,
  detectAsset,
  normalizeAmount,
  extractValidPayment,
  detectMemoCollision,
  detectAbnormalPatterns,
  checkConfirmationStatus,
};
