'use strict';

/**
 * paymentController — all handlers are school-scoped.
 *
 * req.school    — full School document (lean), injected by resolveSchool middleware
 * req.schoolId  — school.schoolId string, also injected by resolveSchool
 *
 * Every DB query includes { schoolId: req.schoolId } to enforce tenant isolation.
 * The school's Stellar wallet address comes from req.school.stellarAddress rather
 * than the old global SCHOOL_WALLET constant.
 */

const crypto = require('crypto');
const Payment = require('../models/paymentModel');
const PaymentIntent = require('../models/paymentIntentModel');
const Student = require('../models/studentModel');
const PendingVerification = require('../models/pendingVerificationModel');
const {
  verifyTransaction,
  syncPaymentsForSchool,
  recordPayment,
  finalizeConfirmedPayments,
} = require('../services/stellarService');
const { queueForRetry } = require('../services/retryService');
const { SCHOOL_WALLET, ACCEPTED_ASSETS, server } = require('../config/stellarConfig');
const StellarSdk = require('@stellar/stellar-sdk');

const { SCHOOL_WALLET, ACCEPTED_ASSETS } = require('../config/stellarConfig');
const { getPaymentLimits } = require('../utils/paymentLimits');
const crypto = require('crypto');

// Permanent error codes that should NOT be retried
const PERMANENT_FAIL_CODES = ['TX_FAILED', 'MISSING_MEMO', 'INVALID_DESTINATION', 'UNSUPPORTED_ASSET', 'AMOUNT_TOO_LOW', 'AMOUNT_TOO_HIGH'];
const { ACCEPTED_ASSETS } = require('../config/stellarConfig');
const { getPaymentLimits } = require('../utils/paymentLimits');
const {
  convertToLocalCurrency,
  enrichPaymentWithConversion,
} = require('../services/currencyConversionService');

const PERMANENT_FAIL_CODES = ['TX_FAILED', 'MISSING_MEMO', 'INVALID_DESTINATION', 'UNSUPPORTED_ASSET', 'AMOUNT_TOO_LOW', 'AMOUNT_TOO_HIGH'];

function wrapStellarError(err) {
  if (!err.code) {
    err.code = 'STELLAR_NETWORK_ERROR';
    err.message = `Stellar network error: ${err.message}`;
  }
  return err;
}

async function getPaymentInstructions(req, res, next) {
  try {
    const limits = getPaymentLimits();
    const targetCurrency = req.school.localCurrency || 'USD';

    let feeConversion = null;
    const student = await Student.findOne({ schoolId: req.schoolId, studentId: req.params.studentId });
    if (student && student.feeAmount) {
      feeConversion = await convertToLocalCurrency(student.feeAmount, 'XLM', targetCurrency);
    }

    res.json({
      walletAddress: req.school.stellarAddress,
      memo: req.params.studentId,
      acceptedAssets: Object.values(ACCEPTED_ASSETS).map(a => ({
        code: a.code,
        type: a.type,
        displayName: a.displayName,
      })),
      paymentLimits: {
        min: limits.min,
        max: limits.max,
      },
      feeAmount: student ? student.feeAmount : null,
      feeLocalEquivalent: feeConversion && feeConversion.available ? {
        amount:        feeConversion.localAmount,
        currency:      feeConversion.currency,
        rate:          feeConversion.rate,
        rateTimestamp: feeConversion.rateTimestamp,
      } : null,
      note: 'Include the payment intent memo exactly when sending payment to ensure your fees are credited.',
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/payments/intent  (Step 1: Record intent)
async function createPaymentIntent(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId } = req.body;

    const student = await Student.findOne({ schoolId, studentId });
    if (!student) return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });

    const { validatePaymentAmount } = require('../utils/paymentLimits');
    const limitValidation = validatePaymentAmount(student.feeAmount);
    if (!limitValidation.valid) {
      return res.status(400).json({
        error: limitValidation.error,
        code: limitValidation.code,
      });
    }

    const memo = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // We now use the Payment model to track the initial 'PENDING' intent.
    const payment = await Payment.create({
      studentId: student._id,
    const intent = await PaymentIntent.create({
      schoolId,
      studentId,
      amount: student.feeAmount,
      memo,
      status: 'PENDING',
      startedAt: new Date(),
    });

    res.status(201).json({
      memo: payment.memo,
      amount: payment.amount,
      studentId: student.studentId,
      paymentId: payment._id
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/payments/submit  (Step 2 & 3: Submit and Track XDR)
async function submitTransaction(req, res, next) {
  try {
    const { xdr } = req.body;
    if (!xdr) {
      return res.status(400).json({ error: 'Missing xdr parameter' });
    }

    // Decode the transaction from the base64 XDR string
    const tx = new StellarSdk.Transaction(xdr, StellarSdk.Networks.TESTNET); // or networkPassphrase
    const transactionHash = tx.hash().toString('hex');
    const memo = tx.memo.value ? tx.memo.value.toString() : null;

    if (!memo) {
      return res.status(400).json({ error: 'Transaction must include the student ID as a memo' });
    }

    // Step 2: Capture XDR/Hash before submission
    // Update or create the Payment record with SUBMITTED status
    let paymentRecord = await Payment.findOne({ memo, status: 'PENDING' }).sort({ createdAt: -1 });
    if (!paymentRecord) {
      const studentObj = await Student.findOne({ studentId: memo });
      if (!studentObj) {
        return res.status(404).json({ error: 'Associated student not found in the database. Cannot process transaction.' });
      }
      paymentRecord = new Payment({
        studentId: studentObj._id,
        memo: memo,
        amount: 0, // Gets corrected on success
      });
    }

    paymentRecord.transactionHash = transactionHash;
    paymentRecord.status = 'SUBMITTED';
    paymentRecord.submittedAt = new Date();
    // Saving the record before sending to the network ensures a robust audit trail
    await paymentRecord.save();

    let txResponse;
    try {
      // Step 3: Send to the Stellar network
      txResponse = await server.submitTransaction(tx);
    } catch (err) {
      paymentRecord.status = 'FAILED';
      let errorReason = err.message;
      if (err.response && err.response.data && err.response.data.extras) {
        errorReason = err.response.data.extras.result_codes.transaction;
      }
      paymentRecord.suspicionReason = errorReason;
      await paymentRecord.save();
      return res.status(400).json({ error: 'Transaction submission failed', code: errorReason });
    }

    // Success
    paymentRecord.status = 'SUCCESS';
    paymentRecord.confirmedAt = new Date();
    paymentRecord.ledgerSequence = txResponse.ledger;
    // (Amount should be extracted from operations, but verifyTransaction does that better)
    await paymentRecord.save();

    res.json({
      verified: true,
      hash: transactionHash,
      ledger: txResponse.ledger,
      status: 'SUCCESS'
    });
    res.status(201).json(intent);
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

    const existing = await Payment.findOne({ transactionHash: txHash, status: 'SUCCESS' });
    // Check if we've already recorded this transaction
    const existing = await Payment.findOne({ txHash });
    if (existing) {
      const err = new Error('Transaction ' + txHash + ' has already been processed');
      err.code = 'DUPLICATE_TX';
      return next(err);
    }

    let result;
    try {
      result = await verifyTransaction(txHash, req.school.stellarAddress);
    } catch (stellarErr) {
      const knownFailCodes = ['TX_FAILED', 'MISSING_MEMO', 'INVALID_DESTINATION', 'UNSUPPORTED_ASSET'];
      // Ensure no 'orphan' payments can be created in the system by removing dummy records
      if (knownFailCodes.includes(stellarErr.code)) {
      // Record a failed payment entry for known failure codes so we have an audit trail
      if (PERMANENT_FAIL_CODES.includes(stellarErr.code)) {
        await Payment.create({
      if (PERMANENT_FAIL_CODES.includes(stellarErr.code)) {
        await Payment.create({
          schoolId,
          studentId: 'unknown',
          transactionHash: txHash,
          amount: 0,
          status: 'FAILED',
          feeValidationStatus: 'unknown',
        }).catch(() => {});
      }
      return next(knownFailCodes.includes(stellarErr.code) ? stellarErr : wrapStellarError(stellarErr));
    }

    if (!result) {
      return res.status(404).json({
        error: 'Transaction found but contains no valid payment to the school wallet',
        code: 'NOT_FOUND',
      });
    }

        }).catch(() => {}); // non-fatal — don't mask the original error
        return next(stellarErr);
      }

      // Transient Stellar network error — cache for retry so the tx is not lost
      await queueForRetry(txHash, req.body.studentId || null, stellarErr.message);
        }).catch(() => {});
        return next(stellarErr);
      }

      await queueForRetry(txHash, req.body.studentId || null, stellarErr.message, schoolId);
      return res.status(202).json({
        message: 'Stellar network is temporarily unavailable. Your transaction has been queued and will be verified automatically.',
        txHash,
        status: 'queued_for_retry',
      });
    }

    if (!result) {
      return res.status(404).json({
        error: 'Transaction found but contains no valid payment to this school wallet',
        code: 'NOT_FOUND',
      });
    }

    const studentStrId = result.studentId || result.memo;
    const studentObj = await Student.findOne({ studentId: studentStrId });
    if (!studentObj) {
      return res.status(404).json({ error: 'Associated student not found. Cannot record transaction.' });
    }

    await recordPayment({
      studentId: studentObj._id,
    // Persist the verified payment
    const now = new Date();
    await recordPayment({
      schoolId,
      studentId: result.studentId || result.memo,
      txHash: result.hash,
      transactionHash: result.hash,
      amount: result.amount,
      feeAmount: result.feeAmount,
      feeValidationStatus: result.feeValidation.status,
      excessAmount: result.feeValidation.excessAmount,
      status: 'SUCCESS',
      memo: result.memo,
      senderAddress: result.senderAddress || null,
      ledgerSequence: result.ledger || null,
      confirmationStatus: 'confirmed',
      confirmedAt: result.date ? new Date(result.date) : now,
      confirmedAt: result.date ? new Date(result.date) : new Date(),
      verifiedAt: now,
    });

    const targetCurrency = req.school.localCurrency || 'USD';
    const conversion = await convertToLocalCurrency(result.amount, result.assetCode || 'XLM', targetCurrency);

    res.json({
      verified: true,
      hash: result.hash,
      memo: result.memo,
      studentId: result.studentId || result.memo,
      amount: result.amount,
      assetCode: result.assetCode,
      assetType: result.assetType,
      feeAmount: result.feeAmount,
      feeValidation: result.feeValidation,
      date: result.date,
      localCurrency: {
        amount:        conversion.available ? conversion.localAmount : null,
        currency:      conversion.currency,
        rate:          conversion.rate,
        rateTimestamp: conversion.rateTimestamp,
        available:     conversion.available,
      },
    });
  } catch (err) {
    // Retry queue logic for transient errors
    const failCodes = ['TX_FAILED', 'MISSING_MEMO', 'INVALID_DESTINATION', 'UNSUPPORTED_ASSET'];
    if (failCodes.includes(err.code)) {
      if (PERMANENT_FAIL_CODES.includes(err.code)) {
        // Ensure no 'orphan' payments can be created in the system
        return next(err);
      }

      await queueForRetry(req.body.txHash, req.body.studentId || null, err.message);
      return res.status(202).json({
        message: 'Stellar network is temporarily unavailable. Your transaction has been queued.',
        txHash: req.body.txHash,
        status: 'queued_for_retry',
      });
    }
    next(err);
  }
}

async function syncAllPayments(req, res, next) {
  try {
    await syncPaymentsForSchool(req.school);
    res.json({ message: 'Sync complete' });
  } catch (err) {
    next(wrapStellarError(err));
  }
}

async function finalizePayments(req, res, next) {
  try {
    await finalizeConfirmedPayments(req.schoolId);
    res.json({ message: 'Finalization complete' });
  } catch (err) {
    next(err);
  }
}

async function getStudentPayments(req, res, next) {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });
    }
    const payments = await Payment.find({ studentId: student._id })
      .sort({ confirmedAt: -1 })
      .populate('studentId', 'name email studentRegNumber');
    const { studentId } = req.params;
    const cacheKey = KEYS.payments(studentId);
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const payments = await Payment.find({ studentId }).sort({ confirmedAt: -1 });
    set(cacheKey, payments, TTL.PAYMENTS);
    res.json(payments);
    const targetCurrency = req.school.localCurrency || 'USD';
    const payments = await Payment
      .find({ schoolId: req.schoolId, studentId: req.params.studentId })
      .sort({ confirmedAt: -1 })
      .lean();

    const enriched = await Promise.all(
      payments.map(p => enrichPaymentWithConversion(p, targetCurrency))
    );
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

async function getAcceptedAssets(req, res, next) {
  try {
    res.json({
      assets: Object.values(ACCEPTED_ASSETS).map(a => ({
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
    const overpayments = await Payment.find({ feeValidationStatus: 'overpaid' })
      .sort({ confirmedAt: -1 })
      .populate('studentId', 'name email studentRegNumber');
    const cacheKey = KEYS.overpayments();
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const overpayments = await Payment.find({ feeValidationStatus: 'overpaid' }).sort({ confirmedAt: -1 });
    const overpayments = await Payment
      .find({ schoolId: req.schoolId, feeValidationStatus: 'overpaid' })
      .sort({ confirmedAt: -1 });
    const totalExcess = overpayments.reduce((sum, p) => sum + (p.excessAmount || 0), 0);
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
    if (!student) return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });

    const result = await Payment.aggregate([
      { $match: { studentId: student._id, status: 'SUCCESS' } },
      { $match: { studentId, status: 'SUCCESS' } },
      { $match: { schoolId, studentId } },
      { $group: { _id: null, totalPaid: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    const totalPaid = result.length ? parseFloat(result[0].totalPaid.toFixed(7)) : 0;
    const remainingBalance = parseFloat(Math.max(0, student.feeAmount - totalPaid).toFixed(7));
    const excessAmount = totalPaid > student.feeAmount
      ? parseFloat((totalPaid - student.feeAmount).toFixed(7))
      : 0;

    const targetCurrency = req.school.localCurrency || 'USD';
    const [feeConv, paidConv, remainingConv] = await Promise.all([
      convertToLocalCurrency(student.feeAmount, 'XLM', targetCurrency),
      convertToLocalCurrency(totalPaid, 'XLM', targetCurrency),
      convertToLocalCurrency(remainingBalance, 'XLM', targetCurrency),
    ]);

    const buildLocal = (conv) => conv.available
      ? { amount: conv.localAmount, currency: conv.currency, rate: conv.rate, rateTimestamp: conv.rateTimestamp }
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
        currency:         targetCurrency,
        available:        feeConv.available,
        rateTimestamp:    feeConv.rateTimestamp,
        feeAmount:        buildLocal(feeConv),
        totalPaid:        buildLocal(paidConv),
        remainingBalance: buildLocal(remainingConv),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getSuspiciousPayments(req, res, next) {
  try {
    const suspicious = await Payment.find({ isSuspicious: true })
      .sort({ confirmedAt: -1 })
      .populate('studentId', 'name email studentRegNumber');
    const cacheKey = KEYS.suspicious();
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const suspicious = await Payment.find({ isSuspicious: true }).sort({ confirmedAt: -1 });
    const data = { count: suspicious.length, suspicious };
    set(cacheKey, data, TTL.SUSPICIOUS);
    res.json(data);
    const suspicious = await Payment
      .find({ schoolId: req.schoolId, isSuspicious: true })
      .sort({ confirmedAt: -1 });
    res.json({ count: suspicious.length, suspicious });
  } catch (err) {
    next(err);
  }
}

async function getPendingPayments(req, res, next) {
  try {
    const pending = await Payment.find({ confirmationStatus: 'pending_confirmation' })
      .sort({ confirmedAt: -1 })
      .populate('studentId', 'name email studentRegNumber');
    const cacheKey = KEYS.pending();
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const pending = await Payment.find({ confirmationStatus: 'pending_confirmation' }).sort({ confirmedAt: -1 });
    const data = { count: pending.length, pending };
    set(cacheKey, data, TTL.PENDING);
    res.json(data);
    const pending = await Payment
      .find({ schoolId: req.schoolId, confirmationStatus: 'pending_confirmation' })
      .sort({ confirmedAt: -1 });
    res.json({ count: pending.length, pending });
  } catch (err) {
    next(err);
  }
}

// GET /api/payments/retry-queue
async function getRetryQueue(req, res) {
  try {
    if (!PendingVerification || typeof PendingVerification.find !== 'function') {
      return res.json({
        pending: { count: 0, items: [] },
        dead_letter: { count: 0, items: [] },
        recently_resolved: { count: 0, items: [] },
      });
    }

    const [pending, deadLetter, resolved] = await Promise.all([
      PendingVerification.find({ schoolId: req.schoolId, status: 'pending' }).sort({ nextRetryAt: 1 }),
      PendingVerification.find({ schoolId: req.schoolId, status: 'dead_letter' }).sort({ updatedAt: -1 }),
      PendingVerification.find({ schoolId: req.schoolId, status: 'resolved' }).sort({ resolvedAt: -1 }).limit(20),
    ]);

    res.json({
      pending:           { count: pending.length, items: pending },
      dead_letter:       { count: deadLetter.length, items: deadLetter },
      recently_resolved: { count: resolved.length, items: resolved },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/payments/rates
async function getExchangeRates(req, res, next) {
  try {
    const targetCurrency = req.school.localCurrency || 'USD';
    const { _getRates } = require('../services/currencyConversionService');
    const rateEntry = await _getRates(targetCurrency);

    if (!rateEntry) {
      return res.json({
        available: false,
        currency: targetCurrency,
        rates: null,
        rateTimestamp: null,
        message: 'Price feed is currently unavailable. Amounts are shown in XLM only.',
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
      startDate,
      endDate,
      minAmount,
      maxAmount,
      status,
      studentId,
      page = 1,
      limit = 50,
    } = req.query;

    // Build filter
    const filter = { schoolId };

    // Date range on confirmedAt
    if (startDate || endDate) {
      filter.confirmedAt = {};
      if (startDate) {
        if (isNaN(Date.parse(startDate))) {
          return res.status(400).json({ error: 'Invalid startDate', code: 'VALIDATION_ERROR' });
        }
        filter.confirmedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        if (isNaN(Date.parse(endDate))) {
          return res.status(400).json({ error: 'Invalid endDate', code: 'VALIDATION_ERROR' });
        }
        // Include the entire end day
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        filter.confirmedAt.$lte = end;
      }
    }

    // Amount range
    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount) {
        const min = Number(minAmount);
        if (!Number.isFinite(min)) return res.status(400).json({ error: 'Invalid minAmount', code: 'VALIDATION_ERROR' });
        filter.amount.$gte = min;
      }
      if (maxAmount) {
        const max = Number(maxAmount);
        if (!Number.isFinite(max)) return res.status(400).json({ error: 'Invalid maxAmount', code: 'VALIDATION_ERROR' });
        filter.amount.$lte = max;
      }
    }

    // Status filter
    if (status) {
      filter.status = status.toUpperCase();
    }

    // Student filter
    if (studentId) {
      filter.studentId = studentId;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * pageSize;

    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ confirmedAt: -1 }).skip(skip).limit(pageSize).lean(),
      Payment.countDocuments(filter),
    ]);

    res.json({
      payments,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── #94 Dead Letter Queue for Failed Jobs ─────────────────────────────────────
/**
 * GET /api/payments/dlq
 *
 * Returns all permanently failed (dead-lettered) jobs from the BullMQ DLQ
 * as well as the MongoDB PendingVerification records with status 'dead_letter'.
 */
async function getDeadLetterJobs(req, res, next) {
  try {
    const { schoolId } = req;

    // MongoDB dead-lettered records (school-scoped)
    const mongoDeadLetters = await PendingVerification.find({
      schoolId,
      status: 'dead_letter',
    }).sort({ updatedAt: -1 }).lean();

    // BullMQ dead-letter queue stats (global — not school-scoped)
    let bullmqDLQ = { enabled: false };
    try {
      const { getDLQStats } = require('../queue/transactionRetryQueue');
      bullmqDLQ = await getDLQStats();
    } catch (_) {
      // BullMQ may not be initialised — that's fine
    }

    res.json({
      mongo: {
        count: mongoDeadLetters.length,
        items: mongoDeadLetters,
      },
      bullmq: bullmqDLQ,
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
      { _id: id, schoolId, status: 'dead_letter' },
      {
        $set: {
          status: 'pending',
          lastError: null,
          nextRetryAt: new Date(),
        },
        $set: { attempts: 0 },
      },
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ error: 'Dead-letter job not found', code: 'NOT_FOUND' });
    }

    res.json({ message: 'Job re-queued for retry', item });
  } catch (err) {
    next(err);
  }
}

// ── #91 Payment Locking Mechanism ────────────────────────────────────────────
/**
 * POST /api/payments/:paymentId/lock
 *
 * Acquires a pessimistic lock on a payment record to prevent simultaneous updates.
 * Uses MongoDB findOneAndUpdate with an atomic lock-check pattern.
 *
 * Body (optional): { lockDurationMs: 30000 }
 */
async function lockPaymentForUpdate(req, res, next) {
  try {
    const { schoolId } = req;
    const { paymentId } = req.params;
    const lockDurationMs = req.body.lockDurationMs || 30000;

    const lockId = `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      { new: true }
    );

    if (!payment) {
      // Either payment doesn't exist or it's already locked
      const exists = await Payment.findOne({ _id: paymentId, schoolId });
      if (!exists) {
        return res.status(404).json({ error: 'Payment not found', code: 'NOT_FOUND' });
      }
      return res.status(409).json({
        error: 'Payment is currently locked by another process',
        code: 'PAYMENT_LOCKED',
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
      return res.status(400).json({ error: 'lockId is required', code: 'VALIDATION_ERROR' });
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
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found or lockId does not match',
        code: 'NOT_FOUND',
      });
    }

    res.json({ unlocked: true, paymentId: payment._id });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPaymentInstructions,
  createPaymentIntent,
  verifyPayment,
  syncAllPayments,
  finalizePayments,
  getStudentPayments,
  getAcceptedAssets,
  getPaymentLimitsEndpoint,
  getOverpayments,
  getStudentBalance,
  getSuspiciousPayments,
  getPendingPayments,
  getRetryQueue,
  submitTransaction,
  getExchangeRates,
  getAllPayments,
  getDeadLetterJobs,
  retryDeadLetterJob,
  lockPaymentForUpdate,
  unlockPayment,
};

