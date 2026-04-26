'use strict';

const axios = require('axios');
const crypto = require('crypto');
const WebhookRetry = require('../models/webhookRetryModel');

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
 * Calculate exponential backoff delay in milliseconds.
 * Delays: 1 min, 5 min, 15 min
 * 
 * @param {number} attemptNumber - 0-indexed attempt number
 * @returns {number} Delay in milliseconds
 */
function getBackoffDelay(attemptNumber) {
  const delays = [60000, 300000, 900000]; // 1 min, 5 min, 15 min
  return delays[Math.min(attemptNumber, delays.length - 1)];
}

/**
 * Fire a webhook to an external system when a payment event occurs.
 * On failure, queues for retry with exponential backoff.
 *
 * @param {string} url - The webhook endpoint URL
 * @param {string} event - Event type: 'payment.confirmed' | 'payment.pending' | 'payment.failed' | 'payment.suspicious'
 * @param {object} payload - Event-specific payload data
 * @param {string|null} [secret] - Per-school HMAC secret for signing the delivery
 * @returns {Promise<{success: boolean, statusCode?: number, error?: string, queued?: boolean}>}
 */
async function fireWebhook(url, event, payload, secret = null) {
  if (!url) return { success: false, error: 'No webhook URL configured' };

  const body = {
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  };

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'StellarEduPay-Webhook/1.0',
    'X-Webhook-Event': event,
  };

  // Sign the payload when a secret is provided
  if (secret) {
    headers['X-StellarEduPay-Signature'] = `sha256=${generateSignature(body, secret)}`;
  }

  const startTime = Date.now();
  try {
    const response = await axios.post(url, body, {
      timeout: WEBHOOK_TIMEOUT_MS,
      headers,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const duration = Date.now() - startTime;
    logger.info(`Webhook fired successfully`, {
      url,
      event,
      statusCode: response.status,
      durationMs: duration,
    });

    return { success: true, statusCode: response.status };
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMessage = err.response
      ? `HTTP ${err.response.status}: ${err.response.statusText}`
      : err.code === 'ECONNABORTED'
        ? 'Connection timeout'
        : err.message;

    logger.error(`Webhook failed, queuing for retry`, {
      url,
      event,
      error: errorMessage,
      durationMs: duration,
    });

    // Queue for retry (secret stored so retries can re-sign)
    try {
      await queueWebhookRetry(url, event, payload, errorMessage, secret);
      return { success: false, error: errorMessage, queued: true };
    } catch (queueErr) {
      logger.error(`Failed to queue webhook retry`, { url, event, error: queueErr.message });
      return { success: false, error: errorMessage, queued: false };
    }
  }
}

/**
 * Queue a failed webhook for retry with exponential backoff.
 * 
 * @param {string} url - Webhook URL
 * @param {string} event - Event type
 * @param {object} payload - Event payload
 * @param {string} error - Error message from failed attempt
 * @param {string|null} [secret] - HMAC secret to re-sign on retry
 */
async function queueWebhookRetry(url, event, payload, error, secret = null) {
  const nextRetryAt = new Date(Date.now() + getBackoffDelay(0)); // First retry: 1 min
  
  await WebhookRetry.create({
    url,
    event,
    payload,
    secret: secret || null,
    status: 'pending',
    attemptCount: 0,
    maxAttempts: 3,
    nextRetryAt,
    lastError: error,
    errorLog: [
      {
        attemptNumber: 0,
        error,
        timestamp: new Date(),
      },
    ],
  });
}

/**
 * Process pending webhook retries.
 * Called periodically by a background job.
 */
async function processPendingRetries() {
  try {
    const now = new Date();
    const pending = await WebhookRetry.find({
      status: 'pending',
      nextRetryAt: { $lte: now },
    }).limit(10); // Process up to 10 at a time

    for (const retry of pending) {
      await retryWebhook(retry);
    }

    return { processed: pending.length };
  } catch (err) {
    logger.error(`Error processing webhook retries`, { error: err.message });
    throw err;
  }
}

/**
 * Retry a single failed webhook.
 * 
 * @param {object} retry - WebhookRetry document
 */
async function retryWebhook(retry) {
  const startTime = Date.now();
  const attemptNumber = retry.attemptCount + 1;

  const body = {
    event: retry.event,
    timestamp: new Date().toISOString(),
    data: retry.payload,
  };

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'StellarEduPay-Webhook/1.0',
    'X-Webhook-Event': retry.event,
  };

  if (retry.secret) {
    headers['X-StellarEduPay-Signature'] = `sha256=${generateSignature(body, retry.secret)}`;
  }

  try {
    const response = await axios.post(retry.url, body, {
      timeout: WEBHOOK_TIMEOUT_MS,
      headers,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const duration = Date.now() - startTime;
    logger.info(`Webhook retry succeeded`, {
      url: retry.url,
      event: retry.event,
      attemptNumber,
      statusCode: response.status,
      durationMs: duration
    });

    // Mark as succeeded
    await WebhookRetry.updateOne(
      { _id: retry._id },
      {
        $set: {
          status: 'succeeded',
          succeededAt: new Date(),
          lastAttemptAt: new Date(),
        },
      }
    );
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMessage = err.response
      ? `HTTP ${err.response.status}: ${err.response.statusText}`
      : err.code === 'ECONNABORTED'
        ? 'Connection timeout'
        : err.message;

    logger.warn(`Webhook retry failed`, {
      url: retry.url,
      event: retry.event,
      attemptNumber,
      error: errorMessage,
      durationMs: duration
    });

    // Check if we should retry again
    if (attemptNumber < retry.maxAttempts) {
      const nextRetryAt = new Date(Date.now() + getBackoffDelay(attemptNumber));
      await WebhookRetry.updateOne(
        { _id: retry._id },
        {
          $set: {
            attemptCount: attemptNumber,
            nextRetryAt,
            lastError: errorMessage,
            lastAttemptAt: new Date(),
          },
          $push: {
            errorLog: {
              attemptNumber,
              error: errorMessage,
              timestamp: new Date(),
            },
          },
        }
      );
    } else {
      // Max retries exhausted
      logger.error(`Webhook retry exhausted after ${retry.maxAttempts} attempts`, {
        url: retry.url,
        event: retry.event,
        payload: retry.payload,
        lastError: errorMessage,
      });

      await WebhookRetry.updateOne(
        { _id: retry._id },
        {
          $set: {
            status: 'failed',
            attemptCount: attemptNumber,
            lastError: errorMessage,
            lastAttemptAt: new Date(),
          },
          $push: {
            errorLog: {
              attemptNumber,
              error: errorMessage,
              timestamp: new Date(),
            },
          },
        }
      );
    }
  }
}

/**
 * Notify external system of a confirmed payment.
 *
 * @param {string} webhookUrl - Registered webhook URL
 * @param {object} payment - Payment document from MongoDB
 * @param {object} student - Student document
 * @param {string|null} [secret] - Per-school HMAC secret
 */
async function notifyPaymentConfirmed(webhookUrl, payment, student, secret = null) {
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
    senderAddress: payment.senderAddress,
  }, secret);
}

/**
 * Notify external system of a pending payment (awaiting ledger confirmation).
 */
async function notifyPaymentPending(webhookUrl, payment, secret = null) {
  return fireWebhook(webhookUrl, 'payment.pending', {
    transactionHash: payment.transactionHash || payment.txHash,
    studentId: payment.studentId,
    amount: payment.amount,
    assetCode: payment.assetCode || 'XLM',
    ledgerSequence: payment.ledgerSequence,
    status: 'pending_confirmation',
  }, secret);
}

/**
 * Notify external system of a failed payment.
 */
async function notifyPaymentFailed(webhookUrl, payment, reason, secret = null) {
  return fireWebhook(webhookUrl, 'payment.failed', {
    transactionHash: payment.transactionHash || payment.txHash,
    studentId: payment.studentId,
    amount: payment.amount || 0,
    reason,
    status: 'FAILED',
  }, secret);
}

/**
 * Notify external system of a suspicious payment flagged by fraud detection.
 */
async function notifyPaymentSuspicious(webhookUrl, payment, reason, secret = null) {
  return fireWebhook(webhookUrl, 'payment.suspicious', {
    transactionHash: payment.transactionHash || payment.txHash,
    studentId: payment.studentId,
    amount: payment.amount,
    reason,
    isSuspicious: true,
    status: payment.status,
  }, secret);
}

module.exports = {
  fireWebhook,
  notifyPaymentConfirmed,
  notifyPaymentPending,
  notifyPaymentFailed,
  notifyPaymentSuspicious,
  generateSignature,
  verifySignature,
  queueWebhookRetry,
  processPendingRetries,
  retryWebhook,
  getBackoffDelay,
};
