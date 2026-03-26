'use strict';

const express = require('express');
const router = express.Router();
const {
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
  getExchangeRates,
  getAllPayments,
  getDeadLetterJobs,
  retryDeadLetterJob,
  lockPaymentForUpdate,
  unlockPayment,
} = require('../controllers/paymentController');

const {
  validateStudentIdParam,
  validateCreatePaymentIntent,
  validateVerifyPayment,
} = require('../middleware/validate');
const { resolveSchool } = require('../middleware/schoolContext');
const idempotency = require('../middleware/idempotency');

// All payment routes require school context
router.use(resolveSchool);

// ── Static routes (before parameterized ones) ────────────────────────────────
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
router.get('/balance/:studentId',            validateStudentIdParam, getStudentBalance);
router.get('/instructions/:studentId',       validateStudentIdParam, getPaymentInstructions);
router.get('/:studentId',                    validateStudentIdParam, getStudentPayments);

// ── Payment locking mechanism ────────────────────────────────────────────────
router.post('/:paymentId/lock',              lockPaymentForUpdate);
router.post('/:paymentId/unlock',            unlockPayment);

module.exports = router;
