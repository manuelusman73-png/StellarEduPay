'use strict';

/**
 * Session Cleanup Service — Expire Abandoned Payment Sessions
 *
 * Periodically cleans up expired payment intents (abandoned sessions).
 * Runs on a configurable interval and marks sessions as 'expired'.
 *
 * Config (via environment variables):
 *   SESSION_CLEANUP_INTERVAL_MS  — how often to run cleanup (default: 1 hour)
 *   SESSION_TIMEOUT_MINUTES      — session expiry time (default: 30 minutes)
 */

const PaymentIntent = require('../models/paymentIntentModel');
const config = require('../config');
const logger = require('../utils/logger').child('SessionCleanupService');

let _timer = null;
let _running = false;

const SESSION_CLEANUP_INTERVAL_MS = parseInt(
  process.env.SESSION_CLEANUP_INTERVAL_MS || String(60 * 60 * 1000),
  10
);

/**
 * Clean up expired payment sessions
 */
async function cleanupExpiredSessions() {
  if (_running) {
    logger.warn('Previous cleanup still in progress — skipping tick');
    return;
  }
  _running = true;

  try {
    const now = new Date();
    const result = await PaymentIntent.updateMany(
      {
        status: 'pending',
        expiresAt: { $lt: now },
      },
      {
        $set: { status: 'expired' },
      }
    );

    if (result.modifiedCount > 0) {
      logger.info('Expired sessions cleaned up', {
        count: result.modifiedCount,
        timestamp: now.toISOString(),
      });
    }
  } catch (err) {
    logger.error('Session cleanup failed', { error: err.message });
  } finally {
    _running = false;
  }
}

/**
 * Start the session cleanup scheduler
 */
function startSessionCleanupScheduler() {
  if (_timer) return;
  logger.info(`Starting — interval: ${SESSION_CLEANUP_INTERVAL_MS}ms`);
  _timer = setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL_MS);
  _timer.unref();
}

/**
 * Stop the session cleanup scheduler
 */
function stopSessionCleanupScheduler() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info('Stopped');
  }
}

module.exports = {
  startSessionCleanupScheduler,
  stopSessionCleanupScheduler,
  cleanupExpiredSessions,
};
