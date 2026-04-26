const { checkConsistency } = require('./consistencyService');
const School = require('../models/schoolModel');

const INTERVAL_MS = parseInt(process.env.CONSISTENCY_CHECK_INTERVAL_MS, 10) || 5 * 60 * 1000; // default 5 min

let _timer = null;

async function runCheck() {
  try {
    const schoolCount = await School.countDocuments({ isActive: true });
    if (schoolCount === 0) {
      console.log('[ConsistencyChecker] Skipping — no active schools configured');
      return;
    }
    const report = await checkConsistency();
    if (report.mismatchCount > 0) {
      console.warn(`[ConsistencyChecker] ${report.mismatchCount} mismatch(es) detected at ${report.checkedAt}:`);
      for (const m of report.mismatches) {
        console.warn(`  [${m.type}] ${m.message}`);
      }
    } else {
      console.log(`[ConsistencyChecker] OK — ${report.totalDbPayments} payments verified at ${report.checkedAt}`);
    }
  } catch (err) {
    console.error('[ConsistencyChecker] Check failed:', err.message);
  }
}

function startConsistencyScheduler() {
  if (_timer) return;
  console.log(`[ConsistencyChecker] Starting — interval: ${INTERVAL_MS}ms`);
  runCheck(); // immediate first run
  _timer = setInterval(runCheck, INTERVAL_MS);
}

function stopConsistencyScheduler() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log('[ConsistencyChecker] Stopped');
  }
}

module.exports = { startConsistencyScheduler, stopConsistencyScheduler };
