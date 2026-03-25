'use strict';

/**
 * Retry Service — Stellar Network Outage Recovery
 *
 * When a Stellar network call fails with a transient error, the transaction hash
 * is cached in MongoDB as a PendingVerification document (with schoolId so the
 * correct wallet is used on retry). This service runs on a configurable interval,
 * checks network reachability, and re-attempts verification with exponential backoff.
 */

const PendingVerification = require('../models/pendingVerificationModel');
const School = require('../models/schoolModel');
const { verifyTransaction, recordPayment } = require('./stellarService');
const { server } = require('../config/stellarConfig');
const config = require('../config/index');

const RETRY_INTERVAL_MS = config.RETRY_INTERVAL_MS;
const MAX_ATTEMPTS = config.RETRY_MAX_ATTEMPTS;

// Exponential backoff: 1m, 2m, 4m … capped at 60 minutes
function nextRetryDelay(attempts) {
  const delayMs = Math.min(Math.pow(2, attempts) * 60_000, 60 * 60_000);
  return new Date(Date.now() + delayMs);
}

async function isStellarReachable() {
  try {
    await server.ledgers().order('desc').limit(1).call();
    return true;
  } catch {
    return false;
  }
}

/**
 * Queue a transaction hash for later retry.
 * schoolId is stored so the retry worker can use the right wallet address.
 *
 * @param {string}      txHash
 * @param {string|null} studentId
 * @param {string}      errorMessage
 * @param {string}      schoolId
 */
async function queueForRetry(txHash, studentId = null, errorMessage = '', schoolId) {
  await PendingVerification.findOneAndUpdate(
    { txHash },
    {
      $setOnInsert: { txHash, studentId, schoolId },
      $set: {
        status: 'pending',
        lastError: errorMessage,
        nextRetryAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
  console.log(`[RetryService] Queued ${txHash} (school: ${schoolId}) — reason: ${errorMessage}`);
}

let _running = false;
let _timer = null;

async function processPendingVerifications() {
  if (_running) return;
  _running = true;

  try {
    const due = await PendingVerification.find({
      status: 'pending',
      nextRetryAt: { $lte: new Date() },
    }).limit(50);

    if (due.length === 0) { _running = false; return; }

    const reachable = await isStellarReachable();
    if (!reachable) {
      console.warn('[RetryService] Stellar network still unreachable — skipping batch');
      _running = false;
      return;
    }

    console.log(`[RetryService] Processing ${due.length} pending verification(s)`);

    for (const item of due) {
      await PendingVerification.findByIdAndUpdate(item._id, {
        status: 'processing',
        lastAttemptAt: new Date(),
        $inc: { attempts: 1 },
      });

      try {
        // Look up the school to get the correct wallet address for verification
        const school = await School.findOne({ schoolId: item.schoolId, isActive: true }).lean();
        if (!school) {
          await PendingVerification.findByIdAndUpdate(item._id, {
            status: 'dead_letter',
            lastError: `School ${item.schoolId} not found or inactive`,
          });
          continue;
        }

        const result = await verifyTransaction(item.txHash, school.stellarAddress);

        if (!result) {
          await PendingVerification.findByIdAndUpdate(item._id, {
            status: 'dead_letter',
            lastError: 'verifyTransaction returned null — transaction is permanently invalid',
          });
          console.warn(`[RetryService] Dead-lettered ${item.txHash} — permanently invalid`);
          continue;
        }

        await recordPayment({
          schoolId: item.schoolId,
          studentId: result.studentId || result.memo,
          txHash: result.hash,
          transactionHash: result.hash,
          amount: result.amount,
          feeAmount: result.expectedAmount || result.feeAmount,
          feeValidationStatus: result.feeValidation.status,
          excessAmount: result.feeValidation.excessAmount || 0,
          status: 'confirmed',
          memo: result.memo,
          confirmedAt: result.date ? new Date(result.date) : new Date(),
        });

        await PendingVerification.findByIdAndUpdate(item._id, {
          status: 'resolved',
          resolvedAt: new Date(),
          lastError: null,
        });

        console.log(`[RetryService] Resolved ${item.txHash} after ${item.attempts + 1} attempt(s)`);
      } catch (err) {
        const attempts = item.attempts + 1;
        const isPermanentError = ['TX_FAILED', 'MISSING_MEMO', 'INVALID_DESTINATION', 'UNSUPPORTED_ASSET', 'DUPLICATE_TX'].includes(err.code);
        const isStellarError = !err.code || err.code === 'STELLAR_NETWORK_ERROR';

        if (isPermanentError || attempts >= MAX_ATTEMPTS) {
          await PendingVerification.findByIdAndUpdate(item._id, {
            status: 'dead_letter',
            lastError: err.message,
          });
          console.error(`[RetryService] Dead-lettered ${item.txHash} — ${isPermanentError ? 'permanent error' : 'max attempts reached'}: ${err.message}`);
        } else if (isStellarError) {
          await PendingVerification.findByIdAndUpdate(item._id, {
            status: 'pending',
            lastError: err.message,
            nextRetryAt: nextRetryDelay(attempts),
          });
          console.warn(`[RetryService] Rescheduled ${item.txHash} (attempt ${attempts})`);
        } else {
          await PendingVerification.findByIdAndUpdate(item._id, {
            status: 'pending',
            lastError: err.message,
            nextRetryAt: nextRetryDelay(attempts),
          });
          console.error(`[RetryService] Unknown error for ${item.txHash}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error('[RetryService] Unexpected error in processPendingVerifications:', err.message);
  } finally {
    _running = false;
  }
}

function startRetryWorker() {
  if (_timer) return;
  console.log(`[RetryService] Starting — interval: ${RETRY_INTERVAL_MS}ms, max attempts: ${MAX_ATTEMPTS}`);
  processPendingVerifications();
  _timer = setInterval(processPendingVerifications, RETRY_INTERVAL_MS);
}

function stopRetryWorker() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log('[RetryService] Stopped');
  }
}

function isRetryWorkerRunning() {
  return _running;
}

module.exports = {
  queueForRetry,
  processPendingVerifications,
  isStellarReachable,
  startRetryWorker,
  stopRetryWorker,
  isRetryWorkerRunning,
};
