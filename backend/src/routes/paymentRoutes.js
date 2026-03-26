'use strict';

const express = require('express');
const router = express.Router();
const {
  getPaymentInstructions,
  createPaymentIntent,
  verifyPayment,
  submitTransaction,
  verifyTransactionHash,
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
  getExchangeRates,
  getAllPayments,
  getDeadLetterJobs,
  retryDeadLetterJob,
  lockPaymentForUpdate,
  unlockPayment,
  generateReceipt,
  getQueueJobStatus,
} = require('../controllers/paymentController');

const {
  validateStudentIdParam,
  validateTxHashParam,
  validateCreatePaymentIntent,
  validateVerifyPayment,
} = require('../middleware/validate');
const { resolveSchool } = require('../middleware/schoolContext');
const idempotency = require('../middleware/idempotency');

// Verify transaction hash (does not require school context)
router.get('/verify/:txHash', validateTxHashParam, verifyTransactionHash);

// All payment routes require school context
router.use(resolveSchool);

// ── Static routes (before parameterized ones) ────────────────────────────────
// ── Static routes (before parameterised ones) ────────────────────────────────
router.get('/',                              getAllPayments);
router.get('/accepted-assets',               getAcceptedAssets);
router.get('/limits',                        getPaymentLimitsEndpoint);
router.get('/overpayments',                  getOverpayments);
router.get('/suspicious',                    getSuspiciousPayments);
router.get('/pending',                       getPendingPayments);
router.get('/retry-queue',                   getRetryQueue);
router.get('/rates',                         getExchangeRates);

// ── Collection routes ────────────────────────────────────────────────────────
router.get('/',                              getAllPayments);

// ── Dead Letter Queue endpoints ──────────────────────────────────────────────
router.get('/dlq',                           getDeadLetterJobs);
router.post('/dlq/:id/retry',                retryDeadLetterJob);

// ── POST routes (mutating operations) ────────────────────────────────────────
router.post('/intent',                       idempotency, validateCreatePaymentIntent, createPaymentIntent);
router.post('/verify',                       idempotency, validateVerifyPayment, verifyPayment);
router.post('/sync',                         syncAllPayments);
router.post('/finalize',                     finalizePayments);

// ── Parameterized routes (must come last) ────────────────────────────────────
router.get('/dlq',                           getDeadLetterJobs);
router.get('/balance/:studentId',            validateStudentIdParam, getStudentBalance);
router.get('/instructions/:studentId',       validateStudentIdParam, getPaymentInstructions);
router.get('/receipt/:txHash',               generateReceipt);
router.get('/queue/:txHash',                 getQueueJobStatus);
router.get('/:studentId',                    validateStudentIdParam, getStudentPayments);

// ── Payment locking mechanism ────────────────────────────────────────────────
// ── POST routes ──────────────────────────────────────────────────────────────
router.post('/intent',                       idempotency, createPaymentIntent);
router.post('/submit',                       validateSubmitTransaction, submitTransaction);
router.post('/verify',                       idempotency, validateVerifyPayment, verifyPayment);
router.post('/sync',                         syncAllPayments);
router.post('/finalize',                     finalizePayments);
router.post('/dlq/:id/retry',                retryDeadLetterJob);

// ── Payment locking ──────────────────────────────────────────────────────────
router.post('/:paymentId/lock',              lockPaymentForUpdate);
router.post('/:paymentId/unlock',            unlockPayment);

module.exports = router;
