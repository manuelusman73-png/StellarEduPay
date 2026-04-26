"use strict";

const Payment = require("../models/paymentModel");
const { generateReferenceCode } = require("../utils/generateReferenceCode");
const logger = require("../utils/logger").child("TransactionService");

/**
 * Persist a payment record, enforcing uniqueness on txHash.
 * Throws DUPLICATE_TX if already recorded.
 * data must include schoolId.
 */
async function savePayment(data) {
  const exists = await Payment.findOne({
    transactionHash: data.transactionHash,
  });
  if (exists) {
    const err = new Error(
      `Transaction ${data.transactionHash} has already been processed`,
    );
    err.code = "DUPLICATE_TX";
    throw err;
  }
  if (!data.referenceCode) {
    data = { ...data, referenceCode: await generateReferenceCode() };
  }
  try {
    return await Payment.create(data);
  } catch (e) {
    if (e.code === 11000) {
      const err = new Error(
        `Transaction ${data.transactionHash} has already been processed`,
      );
      err.code = "DUPLICATE_TX";
      logger.warn("Duplicate transaction rejected", {
        txHash: data.transactionHash,
        schoolId: data.schoolId,
      });
      throw err;
    }
    logger.error("Failed to record payment", {
      error: e.message,
      txHash: data.transactionHash,
      schoolId: data.schoolId,
    });
    throw e;
  }
}

/**
 * Retrieve all payments for a given student, sorted by most recent first.
 */
async function getPaymentsByStudent(studentId) {
  return Payment.find({ studentId }).sort({ confirmedAt: -1 }).lean();
}

module.exports = { savePayment, getPaymentsByStudent };
