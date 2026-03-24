const express = require('express');
const router = express.Router();
const { getPaymentInstructions, verifyPayment, syncAllPayments, getStudentPayments, getAcceptedAssets } = require('../controllers/paymentController');
const { validateStudentIdParam, validateVerifyPayment } = require('../middleware/validate');

router.get('/accepted-assets', getAcceptedAssets);
router.get('/instructions/:studentId', validateStudentIdParam, getPaymentInstructions);
router.get('/:studentId', validateStudentIdParam, getStudentPayments);
router.post('/verify', validateVerifyPayment, verifyPayment);
const { getPaymentInstructions, verifyPayment, syncAllPayments, getStudentPayments, getAcceptedAssets, getOverpayments, getStudentBalance, getSuspiciousPayments, getPendingPayments, finalizePayments } = require('../controllers/paymentController');
const { getPaymentInstructions, verifyPayment, syncAllPayments, getStudentPayments, getAcceptedAssets, getOverpayments, getStudentBalance, getSuspiciousPayments } = require('../controllers/paymentController');
const { getPaymentInstructions, verifyPayment, syncAllPayments, getStudentPayments, getAcceptedAssets, getOverpayments, getStudentBalance } = require('../controllers/paymentController');
const { getPaymentInstructions, verifyPayment, syncAllPayments, getStudentPayments, getAcceptedAssets, getOverpayments } = require('../controllers/paymentController');
const {
  getPaymentInstructions,
  verifyPayment,
  syncAllPayments,
  getStudentPayments,
  getAcceptedAssets,
  createPaymentIntent,
} = require('../controllers/paymentController');

router.get('/accepted-assets', getAcceptedAssets);
router.get('/overpayments', getOverpayments);
router.get('/suspicious', getSuspiciousPayments);
router.get('/pending', getPendingPayments);
router.get('/balance/:studentId', getStudentBalance);
router.get('/instructions/:studentId', getPaymentInstructions);
router.get('/:studentId', getStudentPayments);
router.post('/verify', verifyPayment);
router.post('/sync', syncAllPayments);
router.post('/finalize', finalizePayments);
router.post('/intent', createPaymentIntent);

module.exports = router;
