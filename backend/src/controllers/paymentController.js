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
const crypto = require('crypto');
const StellarSdk = require('@stellar/stellar-sdk');
const Payment = require('../models/paymentModel');
const PaymentIntent = require('../models/paymentIntentModel');
const Student = require('../models/studentModel');
const PendingVerification = require('../models/pendingVerificationModel');

const {
  verifyTransaction,
  syncPaymentsForSchool,
  recordPayment,
  finalizeConfirmedPayments,
} = require("../services/stellarService");
const { queueForRetry } = require("../services/retryService");
const {
  SCHOOL_WALLET,
  ACCEPTED_ASSETS,
  server,
} = require("../config/stellarConfig");
const StellarSdk = require("@stellar/stellar-sdk");
  validatePaymentWithDynamicFee,     // ← New dynamic fee function
} = require('../services/stellarService');
const { queueForRetry } = require('../services/retryService');
const { enqueueTransaction, getJobStatus } = require('../queue/transactionQueue');
const { ACCEPTED_ASSETS, server } = require('../config/stellarConfig');
const StellarSdk = require('@stellar/stellar-sdk');
const { SCHOOL_WALLET, ACCEPTED_ASSETS, server } = require('../config/stellarConfig');
const StellarSdk = require('@stellar/stellar-sdk');
const { validateTransactionHash } = require('../utils/hashValidator');

const { SCHOOL_WALLET, ACCEPTED_ASSETS } = require("../config/stellarConfig");
const { getPaymentLimits } = require("../utils/paymentLimits");
const crypto = require("crypto");

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
const { ACCEPTED_ASSETS } = require("../config/stellarConfig");
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
const { queueForRetry } = require('../services/retryService');
const { getPaymentLimits } = require('../utils/paymentLimits');
const { encryptMemo, isEncryptionEnabled } = require('../utils/memoEncryption');
const {
  convertToLocalCurrency,
  enrichPaymentWithConversion,
} = require('../services/currencyConversionService');

// Permanent error codes that should NOT be retried
const PERMANENT_FAIL_CODES = ['TX_FAILED', 'MISSING_MEMO', 'INVALID_DESTINATION', 'UNSUPPORTED_ASSET', 'AMOUNT_TOO_LOW', 'AMOUNT_TOO_HIGH', 'UNDERPAID'];

const PERMANENT_FAIL_CODES = [
  'TX_FAILED', 'MISSING_MEMO', 'INVALID_DESTINATION', 
  'UNSUPPORTED_ASSET', 'AMOUNT_TOO_LOW', 'AMOUNT_TOO_HIGH', 'UNDERPAID'
];

// ====================== PAYMENT INSTRUCTIONS ======================
async function getPaymentInstructions(req, res, next) {
  try {
    const limits = getPaymentLimits();
    const targetCurrency = req.school.localCurrency || "USD";

    const student = await Student.findOne({ 
      schoolId: req.schoolId, 
      studentId: req.params.studentId 
    });

    let feeConversion = null;
    const student = await Student.findOne({
      schoolId: req.schoolId,
      studentId: req.params.studentId,
    });
    if (student && student.feeAmount) {
      feeConversion = await convertToLocalCurrency(
        student.feeAmount,
        "XLM",
        targetCurrency,
      );
    }

    res.json({
      walletAddress: req.school.stellarAddress,
      memo: req.params.studentId,
      acceptedAssets: Object.values(ACCEPTED_ASSETS).map((a) => ({
      memo: encryptMemo(req.params.studentId),
      memoEncrypted: isEncryptionEnabled(),
      acceptedAssets: Object.values(ACCEPTED_ASSETS).map(a => ({
      memo: req.params.studentId,
      acceptedAssets: Object.values(require('../config/stellarConfig').ACCEPTED_ASSETS || {}).map(a => ({
        code: a.code,
        type: a.type,
        displayName: a.displayName,
      })),
      paymentLimits: { min: limits.min, max: limits.max },
      feeAmount: student ? student.feeAmount : null,
      feeLocalEquivalent:
        feeConversion && feeConversion.available
          ? {
              amount: feeConversion.localAmount,
              currency: feeConversion.currency,
              rate: feeConversion.rate,
              rateTimestamp: feeConversion.rateTimestamp,
            }
          : null,
      note: "Include the payment intent memo exactly when sending payment to ensure your fees are credited.",
      feeLocalEquivalent: feeConversion?.available ? {
        amount: feeConversion.localAmount,
        currency: feeConversion.currency,
        rate: feeConversion.rate,
        rateTimestamp: feeConversion.rateTimestamp,
      } : null,
      note: 'Include the payment intent memo exactly when sending payment.',
    });
  } catch (err) {
    next(err);
  }
}

// ====================== DYNAMIC FEE INTEGRATION ======================
async function createPaymentIntent(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId } = req.body;

    const student = await Student.findOne({ schoolId, studentId });
    if (!student)
      return res
        .status(404)
        .json({ error: "Student not found", code: "NOT_FOUND" });

    const { validatePaymentAmount } = require("../utils/paymentLimits");
    const limitValidation = validatePaymentAmount(student.feeAmount);
    if (!limitValidation.valid) {
      return res.status(400).json({
        error: limitValidation.error,
        code: limitValidation.code,
      });
    }

    const memo = crypto.randomBytes(4).toString("hex").toUpperCase();
    const ttlMs =
      parseInt(process.env.PAYMENT_INTENT_TTL_MS, 10) || 24 * 60 * 60 * 1000;
    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });
    }

    const rawMemo = crypto.randomBytes(4).toString('hex').toUpperCase();
    const memo = encryptMemo(rawMemo);
    const ttlMs = parseInt(process.env.PAYMENT_INTENT_TTL_MS, 10) || 24 * 60 * 60 * 1000;
    const memo = crypto.randomBytes(4).toString('hex').toUpperCase();
    const ttlMs = parseInt(process.env.PAYMENT_INTENT_TTL_MS, 10) || 86400000;
    const expiresAt = new Date(Date.now() + ttlMs);

    const intent = await PaymentIntent.create({
      schoolId,
      studentId,
      amount: student.feeAmount,
      memo,
      status: "PENDING",
      expiresAt,
      startedAt: new Date(),
    });

    res.status(201).json(intent);
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

    // Decode the transaction from the base64 XDR string
    const tx = new StellarSdk.Transaction(
      xdr,
      require("../config/stellarConfig").networkPassphrase,
    );
    const transactionHash = tx.hash().toString("hex");
    const tx = new StellarSdk.Transaction(xdr, require('../config/stellarConfig').networkPassphrase);
    const transactionHash = tx.hash().toString('hex');
    
    // Validate transaction hash format
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

    // Step 2: Capture XDR/Hash before submission
    // Update or create the Payment record with SUBMITTED status
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
        memo: memo,
        amount: 0, // Gets corrected on success
      });
    }

    paymentRecord.transactionHash = transactionHash;
    paymentRecord.status = "SUBMITTED";
    paymentRecord.transactionHash = normalizedHash;
    paymentRecord.status = 'SUBMITTED';
    paymentRecord.submittedAt = new Date();
    // Saving the record before sending to the network ensures a robust audit trail
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

    const submitNetwork = process.env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
    res.json({
      verified: true,
      hash: transactionHash,
      explorerUrl: getExplorerUrl(transactionHash),
      hash: normalizedHash,
      ledger: txResponse.ledger,
      status: "SUCCESS",
      status: 'SUCCESS',
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

    // Check if already recorded
    const existing = await Payment.findOne({ txHash });
    // Validate transaction hash format
    const hashValidation = validateTransactionHash(txHash);
    if (!hashValidation.valid) {
      const err = new Error(hashValidation.error);
      err.code = hashValidation.code;
      return next(err);
    }

    // Use normalized hash
    const normalizedHash = hashValidation.normalized;

    // Check if we've already recorded this transaction
    const existing = await Payment.findOne({ txHash: normalizedHash });
    if (existing) {
      const err = new Error(
        "Transaction " + txHash + " has already been processed",
      );
      err.code = "DUPLICATE_TX";
      const err = new Error('Transaction ' + normalizedHash + ' has already been processed');
      err.code = 'DUPLICATE_TX';
      return next(err);
    }

    // Enqueue for async processing — returns immediately so spikes are absorbed
    const job = await enqueueTransaction(txHash, {
    let result;
    try {
      result = await verifyTransaction(normalizedHash, req.school.stellarAddress);
    } catch (stellarErr) {
      // Record a failed payment entry for known failure codes so we have an audit trail
      if (PERMANENT_FAIL_CODES.includes(stellarErr.code)) {
        await Payment.create({
          schoolId,
          studentId: "unknown",
          txHash: txHash,
          studentId: 'unknown',
          txHash: normalizedHash,
          amount: 0,
          status: "FAILED",
          feeValidationStatus: "unknown",
        }).catch(() => {});
        return next(stellarErr);
      }

      await queueForRetry(
        txHash,
        req.body.studentId || null,
        stellarErr.message,
        schoolId,
      );
      return res.status(202).json({
        message:
          "Stellar network is temporarily unavailable. Your transaction has been queued and will be verified automatically.",
        txHash,
        status: "queued_for_retry",
      await queueForRetry(normalizedHash, req.body.studentId || null, stellarErr.message, schoolId);
      return res.status(202).json({
        message: 'Stellar network is temporarily unavailable. Your transaction has been queued and will be verified automatically.',
        txHash: normalizedHash,
        status: 'queued_for_retry',
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

    // Reject if the payment intent has expired
    const intent = await PaymentIntent.findOne({ memo: result.memo, schoolId });
    if (intent) {
      if (intent.expiresAt && intent.expiresAt < new Date()) {
        await PaymentIntent.findByIdAndUpdate(intent._id, {
          status: "expired",
        });
        const err = new Error(
          "Payment intent has expired. Please request new payment instructions.",
        );
        err.code = "INTENT_EXPIRED";
        err.status = 410;
        return next(err);
      }
    }

    // Persist the verified payment
    const now = new Date();

    // Reject underpaid transactions — do not record as SUCCESS
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

    await recordPayment({
      schoolId,
      studentId: result.studentId || result.memo,
      txHash: result.hash,
      amount: result.amount,
      feeAmount: result.feeAmount,
      feeValidationStatus: result.feeValidation.status,
      excessAmount: result.feeValidation.excessAmount,
      networkFee: result.networkFee, // Store the extracted network fee
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
      school: req.school,
      studentId: req.body.studentId || null,
    });

    return res.status(202).json({
      message: 'Transaction queued for processing',
      txHash,
      jobId: job.id,
      statusUrl: `/api/payments/queue/${txHash}`,
    const targetCurrency = req.school.localCurrency || 'USD';
    const conversion = await convertToLocalCurrency(result.amount, result.assetCode || 'XLM', targetCurrency);
    const network = process.env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
    const explorerUrl = result.hash
      ? `https://stellar.expert/explorer/${network}/tx/${result.hash}`
      : null;

    res.json({
      verified: true,
      hash: result.hash,
      explorerUrl: getExplorerUrl(result.hash),
      memo: result.memo,
      studentId: result.studentId || result.memo,
      amount: result.amount,
      assetCode: result.assetCode,
      assetType: result.assetType,
      feeAmount: result.feeAmount,
      feeValidation: result.feeValidation,
      networkFee: result.networkFee,
      date: result.date,
      explorerUrl,
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

async function getQueueJobStatus(req, res, next) {
  try {
    const { txHash } = req.params;
    const status = await getJobStatus(txHash);
    if (!status) {
      return res.status(404).json({ error: 'No queued job found for this transaction hash', code: 'NOT_FOUND' });
    }
    res.json(status);
  } catch (err) {
    next(err);
  }
}

    await queueForRetry(
      req.body.txHash,
      req.body.studentId || null,
      err.message,
    );
    return res.status(202).json({
      message:
        "Stellar network is temporarily unavailable. Your transaction has been queued.",
      txHash: req.body.txHash,
      status: "queued_for_retry",
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
      return res.status(404).json({ error: 'Transaction not found', code: 'NOT_FOUND' });
    }
    next(wrapStellarError(err));
  }
}

async function syncAllPayments(req, res, next) {
  try {
    await syncPaymentsForSchool(req.school);
    res.json({ message: "Sync complete" });
  } catch (err) {
    next(wrapStellarError(err));
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
    const { studentId } = req.params;
    const targetCurrency = req.school.localCurrency || "USD";
    const payments = await Payment.find({
      schoolId: req.schoolId,
      studentId: req.params.studentId,
    })
    const targetCurrency = req.school.localCurrency || 'USD';
    const network = process.env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';

    const payments = await Payment
      .find({ schoolId: req.schoolId, studentId: req.params.studentId })
      .sort({ confirmedAt: -1 })
      .lean();

    const enriched = await Promise.all(
      payments.map((p) => enrichPaymentWithConversion(p, targetCurrency)),
      payments.map(async (p) => {
        const hash = p.transactionHash || p.txHash;
        const explorerUrl = hash
          ? `https://stellar.expert/explorer/${network}/tx/${hash}`
          : null;
        const converted = await enrichPaymentWithConversion(p, targetCurrency);
        return { ...converted, explorerUrl };
      })
    );
    res.json(enriched);
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

    res.json({
      studentId,
      feeAmount: student.feeAmount,
      totalPaid,
      remainingBalance,
      excessAmount,
      feePaid: totalPaid >= student.feeAmount,
      installmentCount: result.length ? result[0].count : 0,
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
async function getRetryQueue(req, res) {
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
    res.status(500).json({ error: err.message });
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

    // Date range
    if (startDate || endDate) {
      filter.confirmedAt = {};
      if (startDate) {
        if (isNaN(Date.parse(startDate))) {
          return res
            .status(400)
            .json({ error: "Invalid startDate", code: "VALIDATION_ERROR" });
        }
        filter.confirmedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        if (isNaN(Date.parse(endDate))) {
          return res
            .status(400)
            .json({ error: "Invalid endDate", code: "VALIDATION_ERROR" });
        }
        // Include the entire end day
      if (startDate) filter.confirmedAt.$gte = new Date(startDate);
      if (endDate) {
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
      if (minAmount) filter.amount.$gte = Number(minAmount);
      if (maxAmount) filter.amount.$lte = Number(maxAmount);
    }

    if (status) filter.status = status.toUpperCase();
    if (studentId) filter.studentId = studentId;
    if (isSuspicious !== undefined) filter.isSuspicious = isSuspicious === 'true';

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
      Payment.countDocuments(filter)
    ]);

    const enrichedPayments = payments.map((p) => ({
      ...p,
      explorerUrl: getExplorerUrl(p.transactionHash || p.txHash),
    }));

    res.json({
      payments: enrichedPayments,
    const network = process.env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
    const enrichedPayments = payments.map(p => {
      const hash = p.transactionHash || p.txHash;
      return {
        ...p,
        explorerUrl: hash ? `https://stellar.expert/explorer/${network}/tx/${hash}` : null,
      };
    });

    res.json({
      payments: enrichedPayments,
      success: true,
      data: payments,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: pageNum < Math.ceil(total / pageSize),
        hasPrev: pageNum > 1,
      }
    });
  } catch (err) {
    next(err);
  }
}

// ====================== STUDENT PAYMENTS (Also Paginated) ======================
async function getStudentPayments(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    // MongoDB dead-lettered records (school-scoped)
    const mongoDeadLetters = await PendingVerification.find({
      schoolId,
      status: "dead_letter",
    })
      .sort({ updatedAt: -1 })
      .lean();

    // BullMQ dead-letter queue stats (global — not school-scoped)
    let bullmqDLQ = { enabled: false };
    try {
      const { getDLQStats } = require("../queue/transactionRetryQueue");
      bullmqDLQ = await getDLQStats();
    } catch (_) {
      // BullMQ may not be initialised — that's fine
    }
    const [payments, total] = await Promise.all([
      Payment.find({ schoolId, studentId })
        .sort({ confirmedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments({ schoolId, studentId })
    ]);

    const targetCurrency = req.school.localCurrency || 'USD';
    const enriched = await Promise.all(
      payments.map(p => enrichPaymentWithConversion(p, targetCurrency))
    );

    res.json({
      success: true,
      studentId,
      data: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/dlq/:id/retry
 *
 * Re-queue a dead-lettered job for retry by resetting its status to 'pending'.
 */
async function retryDeadLetterJob(req, res, next) {
  try {
    const { schoolId } = req;
    const { id } = req.params;

    const item = await PendingVerification.findOneAndUpdate(
      { _id: id, schoolId, status: "dead_letter" },
      {
        $set: {
          status: "pending",
          lastError: null,
          nextRetryAt: new Date(),
          attempts: 0,
        },
      },
      { new: true },
    );

    if (!item) {
      return res
        .status(404)
        .json({ error: "Dead-letter job not found", code: "NOT_FOUND" });
    }

    res.json({ message: "Job re-queued for retry", item });
  } catch (err) {
    next(err);
  }
}
// ====================== OTHER FUNCTIONS (kept as-is, just cleaned) ======================

// ... [Your other functions like verifyPayment, submitTransaction, syncAllPayments, etc. remain unchanged]

const Receipt = require('../models/receiptModel');

async function generateReceipt(req, res, next) {
  try {
    const { schoolId } = req;
    const { paymentId } = req.params;
    const lockDurationMs = req.body.lockDurationMs || 30000;

    const lockId = `lock_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const lockDeadline = new Date(Date.now() + lockDurationMs);

    // Attempt atomic lock acquisition — only succeeds if payment is not already locked
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
      {
        $set: {
          lockedUntil: lockDeadline,
          lockHolder: lockId,
        },
      },
      { new: true },
    );
    const { txHash } = req.params;

    // Return existing receipt if already generated
    const existing = await Receipt.findOne({ txHash, schoolId });
    if (existing) return res.json(existing);

    const payment = await Payment.findOne({ txHash, schoolId, status: 'SUCCESS' });
    if (!payment) {
      // Either payment doesn't exist or it's already locked
      const exists = await Payment.findOne({ _id: paymentId, schoolId });
      if (!exists) {
        return res
          .status(404)
          .json({ error: "Payment not found", code: "NOT_FOUND" });
      }
      return res.status(409).json({
        error: "Payment is currently locked by another process",
        code: "PAYMENT_LOCKED",
        lockedUntil: exists.lockedUntil,
      });
      return res.status(404).json({ error: 'Confirmed payment not found for this transaction hash', code: 'NOT_FOUND' });
    }

    const receipt = await Receipt.create({
      txHash:              payment.txHash,
      studentId:           payment.studentId,
      schoolId:            payment.schoolId,
      amount:              payment.amount,
      assetCode:           payment.assetCode || 'XLM',
      feeAmount:           payment.feeAmount,
      feeValidationStatus: payment.feeValidationStatus,
      memo:                payment.memo,
      confirmedAt:         payment.confirmedAt,
    });

/**
 * POST /api/payments/:paymentId/unlock
 *
 * Releases a previously acquired lock on a payment record.
 * Body: { lockId: string }
 */
async function unlockPayment(req, res, next) {
  try {
    const { schoolId } = req;
    const { paymentId } = req.params;
    const { lockId } = req.body;

    if (!lockId) {
      return res
        .status(400)
        .json({ error: "lockId is required", code: "VALIDATION_ERROR" });
    }

    const payment = await Payment.findOneAndUpdate(
      {
        _id: paymentId,
        schoolId,
        lockHolder: lockId,
      },
      {
        $set: {
          lockedUntil: null,
          lockHolder: null,
        },
      },
      { new: true },
    );

    if (!payment) {
      return res.status(404).json({
        error: "Payment not found or lockId does not match",
        code: "NOT_FOUND",
      });
    }

    res.json({ unlocked: true, paymentId: payment._id });
    res.status(201).json(receipt);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPaymentInstructions,
  createPaymentIntent,
  verifyPayment,
  verifyTransactionHash,
  submitTransaction,
  syncAllPayments,
  finalizePayments,
  getStudentPayments,
  getAllPayments,                    // ← Updated with proper pagination
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
};
  generateReceipt,
  getQueueJobStatus,
};
