'use strict';

/**
 * Transaction Poller
 *
 * Polls all active schools' Stellar wallets on a fixed interval.
 * Before multi-school support this polled a single global wallet;
 * now it fans out to every active school in parallel.
 */

const School = require('../models/schoolModel');
const { syncPaymentsForSchool } = require('./stellarService');
const { POLL_INTERVAL_MS } = require('../config');

let _timer = null;

function startPolling() {
  if (_timer) return;
  console.log(`[TransactionPoller] Starting — interval: ${POLL_INTERVAL_MS}ms`);

  const run = async () => {
    try {
      const schools = await School.find({ isActive: true }).lean();
      if (schools.length === 0) return;

      // Fan out — poll all school wallets in parallel, errors are isolated per school
      const results = await Promise.allSettled(schools.map(s => syncPaymentsForSchool(s)));

      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.error(`[TransactionPoller] Sync error for school ${schools[i].schoolId}: ${result.reason?.message}`);
        }
      });
    } catch (err) {
      console.error('[TransactionPoller] Fatal sync error:', err.message);
    }
  };

  run(); // immediate first run
  _timer = setInterval(run, POLL_INTERVAL_MS);
  _timer.unref(); // don't keep the process alive (e.g. during tests)
}

function stopPolling() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log('[TransactionPoller] Stopped');
  }
}

module.exports = { startPolling, stopPolling };
