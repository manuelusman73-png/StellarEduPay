'use strict';

const crypto = require('crypto');
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

const Payment = require('../models/paymentModel');
const PaymentIntent = require('../models/paymentIntentModel');
const Student = require('../models/studentModel');
const PendingVerification = require('../models/pendingVerificationModel');
const { syncPayments, verifyTransaction, recordPayment, finalizeConfirmedPayments } = require('../services/stellarService');
const { queueForRetry } = require('../services/retryService');
const { SCHOOL_WALLET, ACCEPTED_ASSETS } = require('../config/stellarConfig');
const { get, set, del, delByPrefix, KEYS, TTL } = require('../cache');
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
const {
  convertToLocalCurrency,
  enrichPaymentWithConversion,
  getCachedRates,
} = require('../services/currencyConversionService');
const crypto = require('crypto');

const PERMANENT_FAIL_CODES = ['TX_FAILED', 'MISSING_MEMO', 'INVALID_DESTINATION', 'UNSUPPORTED_ASSET'];

function wrapStellarError(err) {
  if (!err.code) {
    err.code = 'STELLAR_NETWORK_ERROR';
    err.message = `Stellar network error: ${err.message}`;
  }
  return err;
}

// GET /api/payments/instructions/:studentId
async function getPaymentInstructions(req, res, next) {
  try {
    const limits = getPaymentLimits();
    const targetCurrency = req.school.localCurrency || 'USD';

    // Optionally include the student's fee amount in local currency
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

    // Validate that the student's fee amount is within payment limits
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
 * Success response (200):
 *   {
 *     verified: true,
 *     hash, memo, studentId, amount, assetCode, assetType,
 *     feeAmount, feeValidation: { status, excessAmount, message },
 *     date, alreadyRecorded: boolean
 *   }
 *
 * Error responses follow the global error handler format:
 *   { error: string, code: string }
 *   400 — TX_FAILED | MISSING_MEMO | INVALID_DESTINATION | UNSUPPORTED_ASSET | AMOUNT_TOO_LOW | AMOUNT_TOO_HIGH
 *   409 — DUPLICATE_TX
 *   404 — transaction not found / no valid payment
 *   502 — STELLAR_NETWORK_ERROR
 */
// POST /api/payments/verify
async function verifyPayment(req, res, next) {
  try {
    const { schoolId } = req;
    const { txHash } = req.body;

    const existing = await Payment.findOne({ transactionHash: txHash, status: 'SUCCESS' });
    // Check if we've already recorded this transaction
    const existing = await Payment.findOne({ txHash });
    if (existing) {
      const err = new Error(`Transaction ${txHash} has already been processed`);
      err.code = 'DUPLICATE_TX';
      return next(err);
    }

    let result;
    try {
      // Pass this school's wallet address so verifyTransaction checks the right destination
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

    // verifyTransaction returns null if the tx exists but has no valid payment to the school wallet
    if (!result) {
      return res.status(404).json({
        error: 'Transaction found but contains no valid payment to the school wallet',
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
      feeAmount: result.expectedAmount || result.feeAmount,
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

    // Invalidate caches affected by the new payment
    const verifiedStudentId = result.studentId || result.memo;
    del(
      KEYS.balance(verifiedStudentId),
      KEYS.payments(verifiedStudentId),
      KEYS.student(verifiedStudentId),
      KEYS.studentsAll(),
      KEYS.overpayments(),
      KEYS.suspicious(),
      KEYS.pending(),
    );
    delByPrefix('report:');
    const targetCurrency = req.school.localCurrency || 'USD';
    const conversion = await convertToLocalCurrency(result.amount, result.assetCode || 'XLM', targetCurrency);

    res.json({
      verified: true,
      hash: result.hash,
      memo: result.memo,
      studentId: result.studentId,
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

// POST /api/payments/sync
async function syncAllPayments(req, res, next) {
  try {
    await syncPayments();
    // Sync may record new payments — invalidate payment-related caches
    del(KEYS.overpayments(), KEYS.suspicious(), KEYS.pending());
    delByPrefix('payments:');
    delByPrefix('balance:');
    delByPrefix('report:');
    await syncPaymentsForSchool(req.school); // scoped to this school's wallet
    res.json({ message: 'Sync complete' });
  } catch (err) {
    const wrapped = wrapStellarError(err);
    next(wrapped);
    next(wrapStellarError(err));
  }
}

// POST /api/payments/finalize
async function finalizePayments(req, res, next) {
  try {
    await finalizeConfirmedPayments();
    // Finalization promotes pending → confirmed and updates student records
    del(KEYS.pending(), KEYS.overpayments(), KEYS.suspicious());
    delByPrefix('payments:');
    delByPrefix('balance:');
    delByPrefix('student:');
    del(KEYS.studentsAll());
    delByPrefix('report:');
    await finalizeConfirmedPayments(req.schoolId);
    res.json({ message: 'Finalization complete' });
  } catch (err) {
    next(err);
  }
}

// GET /api/payments/:studentId
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

// GET /api/payments/accepted-assets
async function getAcceptedAssets(req, res, next) {
  try {
    const cacheKey = KEYS.acceptedAssets();
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const data = {
      assets: Object.values(ACCEPTED_ASSETS).map(a => ({
        code: a.code,
        type: a.type,
        displayName: a.displayName,
      })),
    };
    set(cacheKey, data, TTL.ACCEPTED_ASSETS);
    res.json(data);
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

// GET /api/payments/overpayments
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
    const data = { count: overpayments.length, totalExcess, overpayments };
    set(cacheKey, data, TTL.OVERPAYMENTS);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// GET /api/payments/balance/:studentId
async function getStudentBalance(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId } = req.params;
    const cacheKey = KEYS.balance(studentId);
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });
    }
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

    const data = {
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
    };
    set(cacheKey, data, TTL.BALANCE);
    res.json(data);
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

// GET /api/payments/suspicious
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

// GET /api/payments/pending
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
// Returns the current cached exchange rates and their freshness timestamp.
// Useful for the frontend to display "rate as of HH:MM" next to amounts.
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
};
  getExchangeRates,
};
