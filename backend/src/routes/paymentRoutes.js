"use strict";

const express = require("express");
const router = express.Router();

const {
  getPaymentInstructions,
  createPaymentIntent,
  verifyPayment,
  submitTransaction,
  verifyTransactionHash,
  syncAllPayments,
  getSyncStatus,
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
  streamPaymentEvents,
  getPaymentSummary,
} = require("../controllers/paymentController");

const {
  validateStudentIdParam,
  validateTxHashParam,
  validateCreatePaymentIntent,
  validateVerifyPayment,
  validateSubmitTransaction,
} = require("../middleware/validate");
const { resolveSchool } = require("../middleware/schoolContext");
const idempotency = require("../middleware/idempotency");
const { requireAdminAuth } = require("../middleware/auth");
const { auditContext } = require("../middleware/auditContext");
const { strictLimiter } = require("../middleware/rateLimiter");

// No school context required
router.get("/verify/:txHash", validateTxHashParam, verifyTransactionHash);

// Validation runs BEFORE resolveSchool so missing-school requests still get
// proper 400 validation errors when the body itself is invalid.
router.post(
  "/intent",
  validateCreatePaymentIntent,
  idempotency,
  resolveSchool,
  createPaymentIntent,
);
router.post(
  "/submit",
  validateSubmitTransaction,
  resolveSchool,
  submitTransaction,
);

// All remaining routes require school context
router.use(resolveSchool);

router.get("/", getAllPayments);
router.get("/summary", getPaymentSummary);
router.get("/accepted-assets", getAcceptedAssets);
router.get("/limits", getPaymentLimitsEndpoint);
router.get("/sync/status", getSyncStatus);
router.get("/events", streamPaymentEvents);
router.get("/overpayments", getOverpayments);
router.get("/suspicious", getSuspiciousPayments);
router.get("/pending", getPendingPayments);
router.get("/retry-queue", getRetryQueue);
router.get("/rates", getExchangeRates);
router.get("/dlq", getDeadLetterJobs);

router.post(
  "/verify",
  strictLimiter,
  idempotency,
  validateVerifyPayment,
  verifyPayment,
);
router.post("/sync", strictLimiter, requireAdminAuth, auditContext, syncAllPayments);
router.post("/finalize", requireAdminAuth, auditContext, finalizePayments);
router.post("/dlq/:id/retry", retryDeadLetterJob);

router.get("/balance/:studentId", validateStudentIdParam, getStudentBalance);
router.get(
  "/instructions/:studentId",
  validateStudentIdParam,
  getPaymentInstructions,
);
router.get("/receipt/:txHash", generateReceipt);
router.get("/queue/:txHash", getQueueJobStatus);
router.get("/:studentId", validateStudentIdParam, getStudentPayments);

router.post("/:paymentId/lock", lockPaymentForUpdate);
router.post("/:paymentId/unlock", unlockPayment);

module.exports = router;
