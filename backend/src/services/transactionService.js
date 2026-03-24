const { syncPayments } = require('./stellarService');

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS, 10) || 30000;

let _timer = null;

function startPolling() {
  if (_timer) return;
  console.log(`[TransactionPoller] Starting — interval: ${POLL_INTERVAL_MS}ms`);

  const run = async () => {
    try {
      await syncPayments();
    } catch (err) {
      console.error('[TransactionPoller] Sync error:', err.message);
    }
  };

  run(); // immediate first run
  _timer = setInterval(run, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log('[TransactionPoller] Stopped');
  }
}

module.exports = { startPolling, stopPolling };
