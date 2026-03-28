"use strict";

/**
 * Auto-sync service
 *
 * Polls all active schools' Stellar wallets on a configurable interval.
 *
 * Configuration:
 *   SYNC_INTERVAL_MS  — polling interval in ms (default: 60000).
 *                       Set to 0 to disable auto-sync entirely.
 *                       Falls back to POLL_INTERVAL_MS for backwards compatibility.
 *
 * Manual sync (POST /api/payments/sync) works independently and is unaffected.
 */

const School = require("../models/schoolModel");
const { syncPaymentsForSchool } = require("./stellarService");
const { SYNC_INTERVAL_MS } = require("../config");
const logger = require("../utils/logger").child("AutoSync");

let _timer = null;

async function runSyncCycle() {
  const startedAt = new Date().toISOString();

  let schools;
  try {
    schools = await School.find({ isActive: true }).lean();
  } catch (err) {
    logger.error("Failed to fetch active schools", { error: err.message });
    return;
  }

  if (schools.length === 0) {
    logger.debug("Auto-sync: no active schools");
    return;
  }

  const results = await Promise.allSettled(
    schools.map((s) => syncPaymentsForSchool(s)),
  );

  let totalNew = 0;
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      const { newPayments = 0 } = result.value || {};
      totalNew += newPayments;
      if (newPayments > 0) {
        logger.info("Auto-sync: new payments detected", {
          schoolId: schools[i].schoolId,
          newPayments,
          timestamp: startedAt,
        });
      }
    } else {
      logger.error("Auto-sync: school sync failed", {
        schoolId: schools[i].schoolId,
        error: result.reason?.message,
        timestamp: startedAt,
      });
    }
  });

  logger.info("Auto-sync cycle complete", {
    timestamp: startedAt,
    schools: schools.length,
    newPayments: totalNew,
  });
}

function startPolling() {
  if (SYNC_INTERVAL_MS === 0) {
    logger.info("Auto-sync disabled (SYNC_INTERVAL_MS=0)");
    return;
  }

  if (_timer) {
    logger.warn("Auto-sync already running");
    return;
  }

  logger.info(`Auto-sync starting — interval: ${SYNC_INTERVAL_MS}ms`);

  // Run immediately on startup, then on each interval
  runSyncCycle();
  _timer = setInterval(runSyncCycle, SYNC_INTERVAL_MS);
  _timer.unref(); // don't block process exit
}

function stopPolling() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info("Auto-sync stopped");
  }
}

module.exports = { startPolling, stopPolling };
