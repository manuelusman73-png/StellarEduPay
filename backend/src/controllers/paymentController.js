"use strict";

/**
 * paymentController — all handlers are school-scoped.
 * req.school and req.schoolId are injected by resolveSchool middleware.
 */

const crypto = require("crypto");
const Payment = require("../models/paymentModel");
const PaymentIntent = require("../models/paymentIntentModel");
const Student = require("../models/studentModel");
const PendingVerification = require("../models/pendingVerificationModel");
const StellarSdk = require("@stellar/stellar-sdk");

const {
  verifyTransaction,
  syncPaymentsForSchool,
  recordPayment,
  finalizeConfirmedPayments,
  validatePaymentWithDynamicFee,
} = require("../services/stellarService");
const { queueForRetry } = require("../services/retryService");
const {
  enqueueTransaction,
  getJobStatus,
} = require("../queue/transactionQueue");
const {
  SCHOOL_WALLET,
  ACCEPTED_ASSETS,
  server,
} = require("../config/stellarConfig");
const { validateTransactionHash } = require("../utils/hashValidator");
const { getPaymentLimits } = require("../utils/paymentLimits");
const {
  convertToLocalCurrency,
  enrichPaymentWithConversion,
} = require("../services/currencyConversionService");
const { withStellarRetry } = require("../utils/withStellarRetry");

// Permanent error codes that should NOT be retried
const PERMANENT_FAIL_CODES = [
  "TX_FAILED",
  "MISSING_MEMO",
  "INVALID_DESTINATION",
  "UNSUPPORTED_ASSET",
  "AMOUNT_TOO_LOW",
  "AMOUNT_TOO_HIGH",
  "UNDERPAID",
];

function getExplorerUrl(txHash) {
  if (!txHash) return null;
  const network =
    process.env.STELLAR_NETWORK === "mainnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${network}/tx/${txHash}`;
}

function wrapStellarError(err) {
  if (!err.code) {
    err.code = "STELLAR_NETWORK_ERROR";
    err.message = `Stellar network error: ${err.message}`;
  }
  return err;
}
const { encryptMemo, isEncryptionEnabled } = require("../utils/memoEncryption");

// ====================== PAYMENT INSTRUCTIONS ======================
async function getPaymentInstructions(req, res, next) {
  try {
    const limits = getPaymentLimits();
    const targetCurrency = req.school.localCurrency || "USD";
    const { feeCategory } = req.query;

    const student = await Student.findOne({
      schoolId: req.schoolId,
      studentId: req.params.studentId,
    });

    let feeAmount = student ? student.feeAmount : null;
    let feeConversion = null;
    let categoryInfo = null;

    // If feeCategory is specified and student has fees array, use that category
    if (feeCategory && student && student.fees && student.fees.length > 0) {
      const fee = student.fees.find(f => f.category === feeCategory);
      if (fee) {
        feeAmount = fee.amount;
        categoryInfo = {
          category: fee.category,
          amount: fee.amount,
          paid: fee.paid,
          totalPaid: fee.totalPaid || 0,
          remainingBalance: fee.remainingBalance || fee.amount,
        };
      }
    }

    if (feeAmount) {
      feeConversion = await convertToLocalCurrency(
        feeAmount,
        "XLM",
        targetCurrency,
      );
    }

    // Build fees array for response
    const fees = student && student.fees && student.fees.length > 0
      ? student.fees.map(f => ({
        category: f.category,
        amount: f.amount,
        paid: f.paid,
        totalPaid: f.totalPaid || 0,
        remainingBalance: f.remainingBalance || f.amount,
      }))
      : [];

    res.json({
      walletAddress: req.school.stellarAddress,
      memo: encryptMemo(req.params.studentId),
      memoEncrypted: isEncryptionEnabled(),
      acceptedAssets: Object.values(ACCEPTED_ASSETS).map((a) => ({
        code: a.code,
        type: a.type,
        displayName: a.displayName,
      })),
      paymentLimits: { min: limits.min, max: limits.max },
      feeAmount,
      feeCategory: feeCategory || null,
      categoryInfo,
      fees,
      feeLocalEquivalent: feeConversion?.available
        ? {
          amount: feeConversion.localAmount,
          currency: feeConversion.currency,
          rate: feeConversion.rate,
          rateTimestamp: feeConversion.rateTimestamp,
        }
        : null,
      note: "Include the payment intent memo exactly when sending payment. The memo must be sent as a text memo (MEMO_TEXT). Other memo types (MEMO_ID, MEMO_HASH, MEMO_RETURN) will not be recognised and your payment will not be matched.",
      memoType: "text",
    });
  } catch (err) {
    next(err);
  }
}

// ====================== DYNAMIC FEE INTEGRATION ======================
async function createPaymentIntent(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId, feeCategory } = req.body;

    const student = await Student.findOne({ schoolId, studentId });
    if (!student)
      return res
        .status(404)
        .json({ error: "Student not found", code: "NOT_FOUND" });

    let feeAmount = student.feeAmount;
    let categoryInfo = null;

    // If feeCategory is specified and student has fees array, use that category
    if (feeCategory && student.fees && student.fees.length > 0) {
      const fee = student.fees.find(f => f.category === feeCategory);
      if (fee) {
        feeAmount = fee.amount;
        categoryInfo = {
          category: fee.category,
          amount: fee.amount,
          paid: fee.paid,
          totalPaid: fee.totalPaid || 0,
          remainingBalance: fee.remainingBalance || fee.amount,
        };
      } else {
        return res.status(400).json({
          error: `Fee category '${feeCategory}' not found for student`,
          code: "INVALID_FEE_CATEGORY",
        });
      }
    }

    const { validatePaymentAmount } = require("../utils/paymentLimits");
    const limitValidation = validatePaymentAmount(feeAmount);
    if (!limitValidation.valid) {
      return res.status(400).json({
        error: limitValidation.error,
        code: limitValidation.code,
      });
    }

    const rawMemo = crypto.randomBytes(4).toString("hex").toUpperCase();
    const memo = encryptMemo(rawMemo);
    const ttlMs =
      parseInt(process.env.PAYMENT_INTENT_TTL_MS, 10) || 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);

    const intent = await PaymentIntent.create({
      schoolId,
      studentId,
      amount: feeAmount,
      feeCategory: feeCategory || null,
      memo,
      status: "PENDING",
      expiresAt,
      startedAt: new Date(),
    });

    res.status(201).json({
      ...intent.toObject(),
      categoryInfo,
    });
  } catch (err) {
    next(err);
  }
}

// ====================== MAIN PAGINATED ENDPOINT (Improved) ======================
// POST /api/payments/submit  (Step 2 & 3: Submit and Track XDR)
async function submitTransaction(req, res, next) {
  try {
    const { xdr } = req.body;
    if (!xdr) {
      return res.status(400).json({ error: "Missing xdr parameter" });
    }

    const tx = new StellarSdk.Transaction(
      xdr,
      require("../config/stellarConfig").networkPassphrase,
    );
    const transactionHash = tx.hash().toString("hex");

    const hashValidation = validateTransactionHash(transactionHash);
    if (!hashValidation.valid) {
      const err = new Error(hashValidation.error);
      err.code = hashValidation.code;
      return next(err);
    }

    const normalizedHash = hashValidation.normalized;
    const memo = tx.memo.value ? tx.memo.value.toString() : null;

    if (!memo) {
      return res
        .status(400)
        .json({ error: "Transaction must include the student ID as a memo" });
    }

    let paymentRecord = await Payment.findOne({ memo, status: "PENDING" }).sort(
      { createdAt: -1 },
    );
    if (!paymentRecord) {
      const studentObj = await Student.findOne({ studentId: memo });
      if (!studentObj) {
        return res.status(404).json({
          error:
            "Associated student not found in the database. Cannot process transaction.",
        });
      }
      paymentRecord = new Payment({
        studentId: studentObj._id,
        memo,
        amount: 0,
      });
    }

    paymentRecord.transactionHash = normalizedHash;
    paymentRecord.status = "SUBMITTED";
    paymentRecord.submittedAt = new Date();
    await paymentRecord.save();

    let txResponse;
    try {
      // Step 3: Send to the Stellar network (with retry for transient failures)
      txResponse = await withStellarRetry(() => server.submitTransaction(tx), {
        label: "submitTransaction",
      });
    } catch (err) {
      paymentRecord.status = "FAILED";
      let errorReason = err.message;
      if (err.response && err.response.data && err.response.data.extras) {
        errorReason = err.response.data.extras.result_codes.transaction;
      }
      paymentRecord.suspicionReason = errorReason;
      await paymentRecord.save();
      return res
        .status(400)
        .json({ error: "Transaction submission failed", code: errorReason });
    }

    // Verify the response indicates success on-chain
    if (!txResponse.successful) {
      paymentRecord.status = "FAILED";
      paymentRecord.confirmationStatus = "failed";
      paymentRecord.suspicionReason =
        "Transaction was included in ledger but failed on-chain";
      await paymentRecord.save();
      return res.status(400).json({
        error: "Transaction was included in the ledger but failed on-chain",
        code: "TX_FAILED",
        hash: transactionHash,
      });
    }

    // Success
    paymentRecord.status = "SUCCESS";
    paymentRecord.confirmedAt = new Date();
    paymentRecord.ledgerSequence = txResponse.ledger;
    // (Amount should be extracted from operations, but verifyTransaction does that better)
    await paymentRecord.save();

    const submitNetwork =
      process.env.STELLAR_NETWORK === "mainnet" ? "public" : "testnet";
    res.json({
      verified: true,
      hash: normalizedHash,
      ledger: txResponse.ledger,
      status: "SUCCESS",
      status: "SUCCESS",
      explorerUrl: `https://stellar.expert/explorer/${submitNetwork}/tx/${transactionHash}`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/verify
 *
 * Accepts a Stellar transaction hash, queries the Stellar network to verify
 * the payment, records it if valid, and returns the verification result.
 *
 * Request body: { txHash: string }  — 64-char hex string (validated by middleware)
 *
 * Error responses follow the global error handler format:
 *   { error: string, code: string }
 *   400 — TX_FAILED | MISSING_MEMO | INVALID_DESTINATION | UNSUPPORTED_ASSET | AMOUNT_TOO_LOW | AMOUNT_TOO_HIGH
 *   409 — DUPLICATE_TX
 *   404 — transaction not found / no valid payment
 *   502 — STELLAR_NETWORK_ERROR
 */
async function verifyPayment(req, res, next) {
  try {
    const { schoolId } = req;
    const { txHash } = req.body;

    const hashValidation = validateTransactionHash(txHash);
    if (!hashValidation.valid) {
      const err = new Error(hashValidation.error);
      err.code = hashValidation.code;
      return next(err);
    }

    const normalizedHash = hashValidation.normalized;

    const existing = await Payment.findOne({ txHash: normalizedHash });
    if (existing) {
      const err = new Error(
        "Transaction " + normalizedHash + " has already been processed",
      );
      err.code = "DUPLICATE_TX";
      return next(err);
    }

    let result;
    try {
      result = await verifyTransaction(
        normalizedHash,
        req.school.stellarAddress,
      );
    } catch (stellarErr) {
      if (PERMANENT_FAIL_CODES.includes(stellarErr.code)) {
        await Payment.create({
          schoolId,
          studentId: "unknown",
          txHash: normalizedHash,
          amount: 0,
          status: "FAILED",
          feeValidationStatus: "unknown",
        }).catch(() => { });
        return next(stellarErr);
      }

      await queueForRetry(
        normalizedHash,
        req.body.studentId || null,
        stellarErr.message,
        schoolId,
      );
      return res.status(202).json({
        message:
          "Stellar network is temporarily unavailable. Your transaction has been queued and will be verified automatically.",
        txHash: normalizedHash,
        status: "queued_for_retry",
      });
    }

    if (!result) {
      return res.status(404).json({
        error:
          "Transaction found but contains no valid payment to this school wallet",
        code: "NOT_FOUND",
      });
    }

    const studentStrId = result.studentId || result.memo;
    const studentObj = await Student.findOne({ studentId: studentStrId });
    if (!studentObj) {
      return res.status(404).json({
        error: "Associated student not found. Cannot record transaction.",
      });
    }

    const intent = await PaymentIntent.findOne({ memo: result.memo, schoolId });
    if (intent && intent.expiresAt && intent.expiresAt < new Date()) {
      await PaymentIntent.findByIdAndUpdate(intent._id, { status: "expired" });
      const err = new Error(
        "Payment intent has expired. Please request new payment instructions.",
      );
      err.code = "INTENT_EXPIRED";
      err.status = 410;
      return next(err);
    }

    if (result.feeValidation.status === "underpaid") {
      const err = new Error(result.feeValidation.message);
      err.code = "UNDERPAID";
      err.status = 400;
      err.details = {
        paid: result.amount,
        required: result.feeAmount,
        shortfall: parseFloat((result.feeAmount - result.amount).toFixed(7)),
      };
      return next(err);
    }

    const now = new Date();
    await recordPayment({
      schoolId,
      studentId: result.studentId || result.memo,
      txHash: result.hash,
      amount: result.amount,
      feeAmount: result.feeAmount,
      feeValidationStatus: result.feeValidation.status,
      excessAmount: result.feeValidation.excessAmount,
      networkFee: result.networkFee,
      status: "SUCCESS",
      memo: result.memo,
      senderAddress: result.senderAddress || null,
      ledgerSequence: result.ledger || null,
      confirmationStatus: "confirmed",
      confirmedAt: result.date ? new Date(result.date) : now,
      verifiedAt: now,
    });

    const targetCurrency = req.school.localCurrency || "USD";
    const conversion = await convertToLocalCurrency(
      result.amount,
      result.assetCode || "XLM",
      targetCurrency,
    );

    const stellarExplorerUrl = getExplorerUrl(result.hash);
    res.json({
      verified: true,
      hash: result.hash,
      stellarExplorerUrl,
      explorerUrl: stellarExplorerUrl,
      memo: result.memo,
      studentId: result.studentId || result.memo,
      amount: result.amount,
      assetCode: result.assetCode,
      assetType: result.assetType,
      feeAmount: result.feeAmount,
      feeValidation: result.feeValidation,
      networkFee: result.networkFee,
      date: result.date,
      localCurrency: {
        amount: conversion.available ? conversion.localAmount : null,
        currency: conversion.currency,
        rate: conversion.rate,
        rateTimestamp: conversion.rateTimestamp,
        available: conversion.available,
      },
    });
  } catch (err) {
    next(err);
  }
}
async function verifyTransactionHash(req, res, next) {
  try {
    const { txHash } = req.params;

    const tx = await server.transactions().transaction(txHash).call();

    res.json({
      hash: tx.hash,
      successful: tx.successful,
      created_at: tx.created_at,
      ledger: tx.ledger_attr || tx.ledger,
      memo: tx.memo,
      fee_paid: tx.fee_paid,
      source_account: tx.source_account,
      operations_count: tx.operation_count,
    });
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return res
        .status(404)
        .json({ error: "Transaction not found", code: "NOT_FOUND" });
    }
    next(wrapStellarError(err));
  }
}

const _syncLocks = new Set();

async function syncAllPayments(req, res, next) {
  const schoolId = req.schoolId;
  if (_syncLocks.has(schoolId)) {
    return res.status(409).json({ error: "Sync already in progress", code: "SYNC_IN_PROGRESS" });
  }
  _syncLocks.add(schoolId);
  try {
    await syncPaymentsForSchool(req.school);
    res.json({ message: "Sync complete" });
  } catch (err) {
    next(wrapStellarError(err));
  } finally {
    _syncLocks.delete(schoolId);
  }
}

async function getSyncStatus(req, res, next) {
  try {
    const SystemConfig = require("../models/systemConfigModel");
    const lastSyncAt = await SystemConfig.get(`lastSyncAt:${req.schoolId}`);
    res.json({
      lastSyncAt: lastSyncAt || null,
      status: lastSyncAt ? "synced" : "never_synced",
    });
  } catch (err) {
    next(err);
  }
}

async function finalizePayments(req, res, next) {
  try {
    await finalizeConfirmedPayments(req.schoolId);
    res.json({ message: "Finalization complete" });
  } catch (err) {
    next(err);
  }
}

async function getStudentPayments(req, res, next) {
  try {
    const targetCurrency = req.school.localCurrency || "USD";
    const network =
      process.env.STELLAR_NETWORK === "mainnet" ? "public" : "testnet";

    // Pagination parameters
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const total = await Payment.countDocuments({
      schoolId: req.schoolId,
      studentId: req.params.studentId,
    });

    const payments = await Payment.find({
      schoolId: req.schoolId,
      studentId: req.params.studentId,
    })
      .sort({ confirmedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const enriched = await Promise.all(
      payments.map(async (p) => {
        const hash = p.transactionHash || p.txHash;
        const explorerUrl = hash
          ? `https://stellar.expert/explorer/${network}/tx/${hash}`
          : null;
        const converted = await enrichPaymentWithConversion(p, targetCurrency);
        return { ...converted, explorerUrl };
      }),
    );

    const pages = Math.ceil(total / limit);

    res.json({
      payments: enriched,
      total,
      page,
      pages,
    });
  } catch (err) {
    next(err);
  }
}

async function getAcceptedAssets(req, res, next) {
  try {
    res.json({
      assets: Object.values(ACCEPTED_ASSETS).map((a) => ({
        code: a.code,
        type: a.type,
        displayName: a.displayName,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/payments/limits
async function getPaymentLimitsEndpoint(req, res, next) {
  try {
    const limits = getPaymentLimits();
    res.json({
      min: limits.min,
      max: limits.max,
      message: `Payment amounts must be between ${limits.min} and ${limits.max}`,
    });
  } catch (err) {
    next(err);
  }
}

async function getOverpayments(req, res, next) {
  try {
    const overpayments = await Payment.find({
      schoolId: req.schoolId,
      feeValidationStatus: "overpaid",
    }).sort({ confirmedAt: -1 });
    const totalExcess = overpayments.reduce(
      (sum, p) => sum + (p.excessAmount || 0),
      0,
    );
    res.json({ count: overpayments.length, totalExcess, overpayments });
  } catch (err) {
    next(err);
  }
}

async function getStudentBalance(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId } = req.params;

    const student = await Student.findOne({ schoolId, studentId });
    if (!student)
      return res
        .status(404)
        .json({ error: "Student not found", code: "NOT_FOUND" });

    const result = await Payment.aggregate([
      { $match: { schoolId, studentId } },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalPaid = result.length
      ? parseFloat(result[0].totalPaid.toFixed(7))
      : 0;
    const remainingBalance = parseFloat(
      Math.max(0, student.feeAmount - totalPaid).toFixed(7),
    );
    const excessAmount =
      totalPaid > student.feeAmount
        ? parseFloat((totalPaid - student.feeAmount).toFixed(7))
        : 0;

    const targetCurrency = req.school.localCurrency || "USD";
    const [feeConv, paidConv, remainingConv] = await Promise.all([
      convertToLocalCurrency(student.feeAmount, "XLM", targetCurrency),
      convertToLocalCurrency(totalPaid, "XLM", targetCurrency),
      convertToLocalCurrency(remainingBalance, "XLM", targetCurrency),
    ]);

    const buildLocal = (conv) =>
      conv.available
        ? {
          amount: conv.localAmount,
          currency: conv.currency,
          rate: conv.rate,
          rateTimestamp: conv.rateTimestamp,
        }
        : null;

    // Build per-category breakdown if fees array exists
    let categoryBreakdown = [];
    if (student.fees && student.fees.length > 0) {
      // Get payments grouped by fee category
      const categoryPayments = await Payment.aggregate([
        { $match: { schoolId, studentId, feeCategory: { $ne: null } } },
        {
          $group: {
            _id: "$feeCategory",
            totalPaid: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);

      const categoryPaymentMap = {};
      categoryPayments.forEach(cp => {
        categoryPaymentMap[cp._id] = {
          totalPaid: parseFloat(cp.totalPaid.toFixed(7)),
          installmentCount: cp.count,
        };
      });

      categoryBreakdown = student.fees.map(fee => {
        const paid = categoryPaymentMap[fee.category] || { totalPaid: 0, installmentCount: 0 };
        const remaining = Math.max(0, fee.amount - paid.totalPaid);
        return {
          category: fee.category,
          amount: fee.amount,
          totalPaid: paid.totalPaid,
          remainingBalance: remaining,
          paid: paid.totalPaid >= fee.amount,
          installmentCount: paid.installmentCount,
          paymentDeadline: fee.paymentDeadline,
        };
      });
    }

    res.json({
      studentId,
      feeAmount: student.feeAmount,
      totalPaid,
      remainingBalance,
      excessAmount,
      feePaid: totalPaid >= student.feeAmount,
      installmentCount: result.length ? result[0].count : 0,
      categoryBreakdown,
      localCurrency: {
        currency: targetCurrency,
        available: feeConv.available,
        rateTimestamp: feeConv.rateTimestamp,
        feeAmount: buildLocal(feeConv),
        totalPaid: buildLocal(paidConv),
        remainingBalance: buildLocal(remainingConv),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getSuspiciousPayments(req, res, next) {
  try {
    const suspicious = await Payment.find({
      schoolId: req.schoolId,
      isSuspicious: true,
    }).sort({ confirmedAt: -1 });
    res.json({ count: suspicious.length, suspicious });
  } catch (err) {
    next(err);
  }
}

async function getPendingPayments(req, res, next) {
  try {
    const pending = await Payment.find({
      schoolId: req.schoolId,
      confirmationStatus: "pending_confirmation",
    }).sort({ confirmedAt: -1 });
    res.json({ count: pending.length, pending });
  } catch (err) {
    next(err);
  }
}

// GET /api/payments/retry-queue
async function getRetryQueue(req, res, next) {
  try {
    if (
      !PendingVerification ||
      typeof PendingVerification.find !== "function"
    ) {
      return res.json({
        pending: { count: 0, items: [] },
        dead_letter: { count: 0, items: [] },
        recently_resolved: { count: 0, items: [] },
      });
    }

    const [pending, deadLetter, resolved] = await Promise.all([
      PendingVerification.find({
        schoolId: req.schoolId,
        status: "pending",
      }).sort({ nextRetryAt: 1 }),
      PendingVerification.find({
        schoolId: req.schoolId,
        status: "dead_letter",
      }).sort({ updatedAt: -1 }),
      PendingVerification.find({ schoolId: req.schoolId, status: "resolved" })
        .sort({ resolvedAt: -1 })
        .limit(20),
    ]);

    res.json({
      pending: { count: pending.length, items: pending },
      dead_letter: { count: deadLetter.length, items: deadLetter },
      recently_resolved: { count: resolved.length, items: resolved },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/payments/rates
async function getExchangeRates(req, res, next) {
  try {
    const targetCurrency = req.school.localCurrency || "USD";
    const { _getRates } = require("../services/currencyConversionService");
    const rateEntry = await _getRates(targetCurrency);

    if (!rateEntry) {
      return res.json({
        available: false,
        currency: targetCurrency,
        rates: null,
        rateTimestamp: null,
        message:
          "Price feed is currently unavailable. Amounts are shown in XLM only.",
      });
    }

    res.json({
      available: true,
      currency: targetCurrency,
      rates: rateEntry.rates,
      rateTimestamp: rateEntry.fetchedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ── #93 Transaction Filtering API ─────────────────────────────────────────────
/**
 * GET /api/payments/
 *
 * Query params (all optional):
 *   startDate  — ISO date string (e.g. 2026-01-01)
 *   endDate    — ISO date string (e.g. 2026-12-31)
 *   minAmount  — minimum payment amount (inclusive)
 *   maxAmount  — maximum payment amount (inclusive)
 *   status     — payment status filter (e.g. SUCCESS, FAILED, PENDING)
 *   studentId  — filter by student ID
 *   page       — pagination page (default 1)
 *   limit      — page size (default 50, max 200)
 */
async function getAllPayments(req, res, next) {
  try {
    const { schoolId } = req;
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      status,
      studentId,
      isSuspicious,
    } = req.query;

    const filter = { schoolId };

    if (startDate || endDate) {
      filter.confirmedAt = {};
      if (startDate) {
        if (isNaN(Date.parse(startDate)))
          return res
            .status(400)
            .json({ error: "Invalid startDate", code: "VALIDATION_ERROR" });
        filter.confirmedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        if (isNaN(Date.parse(endDate)))
          return res
            .status(400)
            .json({ error: "Invalid endDate", code: "VALIDATION_ERROR" });
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        filter.confirmedAt.$lte = end;
      }
    }

    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount) {
        const min = Number(minAmount);
        if (!Number.isFinite(min))
          return res
            .status(400)
            .json({ error: "Invalid minAmount", code: "VALIDATION_ERROR" });
        filter.amount.$gte = min;
      }
      if (maxAmount) {
        const max = Number(maxAmount);
        if (!Number.isFinite(max))
          return res
            .status(400)
            .json({ error: "Invalid maxAmount", code: "VALIDATION_ERROR" });
        filter.amount.$lte = max;
      }
    }

    if (status) filter.status = status.toUpperCase();
    if (studentId) filter.studentId = studentId;
    if (isSuspicious !== undefined)
      filter.isSuspicious = isSuspicious === "true";

    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * pageSize;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .sort({ confirmedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Payment.countDocuments(filter),
    ]);

    const enrichedPayments = payments.map((p) => ({
      ...p,
      stellarExplorerUrl: getExplorerUrl(p.transactionHash || p.txHash),
      explorerUrl: getExplorerUrl(p.transactionHash || p.txHash),
    }));

    res.json({
      payments: enrichedPayments,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: pageNum < Math.ceil(total / pageSize),
        hasPrev: pageNum > 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ====================== OTHER FUNCTIONS (kept as-is, just cleaned) ======================

const Receipt = require("../models/receiptModel");

async function generateReceipt(req, res, next) {
  try {
    const { schoolId } = req;
    const { txHash } = req.params;

    const existing = await Receipt.findOne({ txHash, schoolId });
    if (existing) return res.json(existing);

    const payment = await Payment.findOne({
      txHash,
      schoolId,
      status: "SUCCESS",
    });
    if (!payment) {
      return res.status(404).json({
        error: "Confirmed payment not found for this transaction hash",
        code: "NOT_FOUND",
      });
    }

    const receipt = await Receipt.create({
      txHash: payment.txHash,
      studentId: payment.studentId,
      schoolId: payment.schoolId,
      amount: payment.amount,
      assetCode: payment.assetCode || "XLM",
      feeAmount: payment.feeAmount,
      feeValidationStatus: payment.feeValidationStatus,
      memo: payment.memo,
      confirmedAt: payment.confirmedAt,
    });

    res.status(201).json(receipt);
  } catch (err) {
    next(err);
  }
}

async function lockPaymentForUpdate(req, res, next) {
  try {
    const { schoolId } = req;
    const { paymentId } = req.params;
    const lockDurationMs = req.body.lockDurationMs || 30000;
    const lockId = `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const lockDeadline = new Date(Date.now() + lockDurationMs);

    const payment = await Payment.findOneAndUpdate(
      {
        _id: paymentId,
        schoolId,
        $or: [
          { lockedUntil: null },
          { lockedUntil: { $exists: false } },
          { lockedUntil: { $lte: new Date() } },
        ],
      },
      { $set: { lockedUntil: lockDeadline, lockHolder: lockId } },
      { new: true },
    );

    if (!payment) {
      const exists = await Payment.findOne({ _id: paymentId, schoolId });
      if (!exists)
        return res
          .status(404)
          .json({ error: "Payment not found", code: "NOT_FOUND" });
      return res.status(409).json({
        error: "Payment is currently locked by another process",
        code: "PAYMENT_LOCKED",
        lockedUntil: exists.lockedUntil,
      });
    }

    res.json({
      locked: true,
      lockId,
      lockedUntil: lockDeadline,
      paymentId: payment._id,
    });
  } catch (err) {
    next(err);
  }
}

async function unlockPayment(req, res, next) {
  try {
    const { schoolId } = req;
    const { paymentId } = req.params;
    const { lockId } = req.body;

    if (!lockId)
      return res
        .status(400)
        .json({ error: "lockId is required", code: "VALIDATION_ERROR" });

    const payment = await Payment.findOneAndUpdate(
      { _id: paymentId, schoolId, lockHolder: lockId },
      { $set: { lockedUntil: null, lockHolder: null } },
      { new: true },
    );

    if (!payment)
      return res.status(404).json({
        error: "Payment not found or lockId does not match",
        code: "NOT_FOUND",
      });

    res.json({ unlocked: true, paymentId: payment._id });
  } catch (err) {
    next(err);
  }
}

async function getDeadLetterJobs(req, res, next) {
  try {
    const { getDeadLetterQueue } = require("../config/retryQueueSetup");
    const queue = getDeadLetterQueue();
    const jobs = queue ? await queue.getFailed(0, 99) : [];
    res.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        data: j.data,
        failedReason: j.failedReason,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function retryDeadLetterJob(req, res, next) {
  try {
    const { getDeadLetterQueue } = require("../config/retryQueueSetup");
    const { jobId } = req.params;
    const queue = getDeadLetterQueue();
    if (!queue)
      return res.status(503).json({
        error: "Retry queue unavailable",
        code: "SERVICE_UNAVAILABLE",
      });
    const job = await queue.getJob(jobId);
    if (!job)
      return res
        .status(404)
        .json({ error: "Job not found", code: "NOT_FOUND" });
    await job.retry();
    res.json({ message: "Job queued for retry", jobId });
  } catch (err) {
    next(err);
  }
}

async function getQueueJobStatus(req, res, next) {
  try {
    const { getRetryQueueStatus } = require("../config/retryQueueSetup");
    const status = await getRetryQueueStatus();
    res.json(status || { available: false });
  } catch (err) {
    next(err);
  }
}

// GET /api/payments/summary
async function getPaymentSummary(req, res, next) {
  try {
    const { schoolId } = req;

    const [studentStats, xlmStats, categoryStats] = await Promise.all([
      Student.aggregate([
        { $match: { schoolId, deletedAt: null } },
        {
          $group: {
            _id: null,
            totalStudents: { $sum: 1 },
            paidCount: { $sum: { $cond: ["$feePaid", 1, 0] } },
            unpaidCount: { $sum: { $cond: ["$feePaid", 0, 1] } },
          },
        },
      ]),
      Payment.aggregate([
        { $match: { schoolId, status: "SUCCESS", deletedAt: null } },
        { $group: { _id: null, totalXlmCollected: { $sum: "$amount" } } },
      ]),
      // Get per-category statistics
      Payment.aggregate([
        { $match: { schoolId, status: "SUCCESS", deletedAt: null, feeCategory: { $ne: null } } },
        {
          $group: {
            _id: "$feeCategory",
            totalCollected: { $sum: "$amount" },
            paymentCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const s = studentStats[0] || {
      totalStudents: 0,
      paidCount: 0,
      unpaidCount: 0,
    };
    const x = xlmStats[0] || { totalXlmCollected: 0 };

    // Build category breakdown
    const categoryBreakdown = categoryStats.map(cat => ({
      category: cat._id,
      totalCollected: parseFloat(cat.totalCollected.toFixed(7)),
      paymentCount: cat.paymentCount,
    }));

    res.json({
      totalStudents: s.totalStudents,
      paidCount: s.paidCount,
      unpaidCount: s.unpaidCount,
      totalXlmCollected: parseFloat(x.totalXlmCollected.toFixed(7)),
      categoryBreakdown,
    });
  } catch (err) {
    next(err);
  }
}

function streamPaymentEvents(req, res) {
  const { addClient, removeClient } = require("../services/sseService");
  const schoolId = req.schoolId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const ping = setInterval(() => res.write(": ping\n\n"), 30000);
  addClient(schoolId, res);

  req.on("close", () => {
    clearInterval(ping);
    removeClient(schoolId, res);
  });
}

module.exports = {
  getPaymentInstructions,
  createPaymentIntent,
  verifyPayment,
  verifyTransactionHash,
  submitTransaction,
  syncAllPayments,
  getSyncStatus,
  finalizePayments,
  getStudentPayments,
  getAllPayments, // ← Updated with proper pagination
  getAcceptedAssets,
  getPaymentLimitsEndpoint,
  getOverpayments,
  getStudentBalance,
  getSuspiciousPayments,
  getPendingPayments,
  getRetryQueue,
  getExchangeRates,
  getDeadLetterJobs,
  retryDeadLetterJob,
  lockPaymentForUpdate,
  unlockPayment,
  generateReceipt,
  getQueueJobStatus,
  streamPaymentEvents,
  getPaymentSummary,
};
