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
} = require('../controllers/paymentController');
const { validateStudentIdParam, validateVerifyPayment } = require('../middleware/validate');
const { resolveSchool } = require('../middleware/schoolContext');

// Static routes first (before :studentId wildcard)
router.get('/accepted-assets', getAcceptedAssets);
router.get('/limits', getPaymentLimitsEndpoint);
router.get('/overpayments', getOverpayments);
router.get('/suspicious', getSuspiciousPayments);
router.get('/pending', getPendingPayments);
router.get('/retry-queue', getRetryQueue);
router.get('/balance/:studentId', validateStudentIdParam, getStudentBalance);
router.get('/instructions/:studentId', validateStudentIdParam, getPaymentInstructions);

// POST routes
router.post('/intent', createPaymentIntent);
router.post('/verify', validateVerifyPayment, verifyPayment);
router.post('/sync', syncAllPayments);
router.post('/finalize', finalizePayments);
// All payment routes require school context
router.use(resolveSchool);

// Static routes before parameterized ones
router.get('/accepted-assets',                    getAcceptedAssets);
router.get('/overpayments',                       getOverpayments);
router.get('/suspicious',                         getSuspiciousPayments);
router.get('/pending',                            getPendingPayments);
router.get('/retry-queue',                        getRetryQueue);
router.get('/rates',                              getExchangeRates);
router.get('/balance/:studentId',                 validateStudentIdParam, getStudentBalance);
router.get('/instructions/:studentId',            validateStudentIdParam, getPaymentInstructions);

router.post('/intent',                            createPaymentIntent);
router.post('/verify',                            validateVerifyPayment, verifyPayment);
router.post('/sync',                              syncAllPayments);
router.post('/finalize',                          finalizePayments);

// Parameterized route last
router.get('/:studentId',                         validateStudentIdParam, getStudentPayments);

module.exports = router;