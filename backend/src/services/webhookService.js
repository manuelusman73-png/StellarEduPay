'use strict';

const axios = require('axios');
const crypto = require('crypto');

/**
 * Generate HMAC signature for webhook payload verification.
 * Clients should verify incoming requests using this signature.
 *
 * @param {object} payload - The JSON body sent to the webhook
 * @param {string} secret - The shared secret for this webhook
 * @returns {string} HMAC-SHA256 signature in hex format
 */
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

/**
 * Verify an incoming webhook signature.
 *
 * @param {object} payload - Raw request body
 * @param {string} signature - Value of X-Webhook-Signature header
 * @param {string} secret - Shared secret
 * @returns {boolean}
 */
function verifySignature(payload, signature, secret) {
  const expected = generateSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
}
const logger = require('../utils/logger').child('WebhookService');

const WEBHOOK_TIMEOUT_MS = 10000; // 10 second timeout

/**
 * Fire a webhook to an external system when a payment event occurs.
 *
 * @param {string} url - The webhook endpoint URL
 * @param {string} event - Event type: 'payment.confirmed' | 'payment.pending' | 'payment.failed' | 'payment.suspicious'
 * @param {object} payload - Event-specific payload data
 * @returns {Promise<{success: boolean, statusCode?: number, error?: string}>}
 */
async function fireWebhook(url, event, payload) {
  if (!url) return { success: false, error: 'No webhook URL configured' };

  const startTime = Date.now();
  try {
    const response = await axios.post(url, {
      event,
      timestamp: new Date().toISOString(),
      data: payload
    }, {
      timeout: WEBHOOK_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'StellarEduPay-Webhook/1.0',
        'X-Webhook-Event': event
      },
      validateStatus: (status) => status >= 200 && status < 300
    });

    const duration = Date.now() - startTime;
    logger.info(`Webhook fired successfully`, {
      url,
      event,
      statusCode: response.status,
      durationMs: duration
    });

    return { success: true, statusCode: response.status };
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMessage = err.response
      ? `HTTP ${err.response.status}: ${err.response.statusText}`
      : err.code === 'ECONNABORTED'
        ? 'Connection timeout'
        : err.message;

    logger.error(`Webhook failed`, {
      url,
      event,
      error: errorMessage,
      durationMs: duration
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Notify external system of a confirmed payment.
 *
 * @param {string} webhookUrl - Registered webhook URL
 * @param {object} payment - Payment document from MongoDB
 * @param {object} student - Student document
 */
async function notifyPaymentConfirmed(webhookUrl, payment, student) {
  return fireWebhook(webhookUrl, 'payment.confirmed', {
    transactionHash: payment.transactionHash || payment.txHash,
    studentId: payment.studentId,
    amount: payment.amount,
    assetCode: payment.assetCode || 'XLM',
    finalFee: payment.finalFee,
    feeValidationStatus: payment.feeValidationStatus,
    confirmedAt: payment.confirmedAt,
    referenceCode: payment.referenceCode,
    schoolId: payment.schoolId,
    senderAddress: payment.senderAddress
  });
}

/**
 * Notify external system of a pending payment (awaiting ledger confirmation).
 */
async function notifyPaymentPending(webhookUrl, payment) {
  return fireWebhook(webhookUrl, 'payment.pending', {
    transactionHash: payment.transactionHash || payment.txHash,
    studentId: payment.studentId,
    amount: payment.amount,
    assetCode: payment.assetCode || 'XLM',
    ledgerSequence: payment.ledgerSequence,
    status: 'pending_confirmation'
  });
}

/**
 * Notify external system of a failed payment.
 */
async function notifyPaymentFailed(webhookUrl, payment, reason) {
  return fireWebhook(webhookUrl, 'payment.failed', {
    transactionHash: payment.transactionHash || payment.txHash,
    studentId: payment.studentId,
    amount: payment.amount || 0,
    reason,
    status: 'FAILED'
  });
}

/**
 * Notify external system of a suspicious payment flagged by fraud detection.
 */
async function notifyPaymentSuspicious(webhookUrl, payment, reason) {
  return fireWebhook(webhookUrl, 'payment.suspicious', {
    transactionHash: payment.transactionHash || payment.txHash,
    studentId: payment.studentId,
    amount: payment.amount,
    reason,
    isSuspicious: true,
    status: payment.status
  });
}

module.exports = {
  fireWebhook,
  notifyPaymentConfirmed,
  notifyPaymentPending,
  notifyPaymentFailed,
  notifyPaymentSuspicious,
  generateSignature,
  verifySignature
};
