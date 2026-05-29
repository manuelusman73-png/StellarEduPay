'use strict';

const logger = require('./logger');

/**
 * Monitors Node.js heap usage and logs warnings when usage exceeds 80% of max-old-space-size.
 * Helps detect memory leaks before OOM kill occurs.
 */
function startHeapMonitoring() {
  const v8 = require('v8');
  const heapStats = v8.getHeapStatistics();
  const maxHeapSize = heapStats.heap_size_limit;
  const warningThreshold = maxHeapSize * 0.8;

  const MONITORING_INTERVAL_MS = 30000; // Check every 30 seconds

  const interval = setInterval(() => {
    const heapUsed = process.memoryUsage().heapUsed;
    const heapUsedPercent = (heapUsed / maxHeapSize) * 100;

    if (heapUsed > warningThreshold) {
      logger.warn('HEAP_USAGE_WARNING', {
        heapUsedBytes: heapUsed,
        heapUsedMB: Math.round(heapUsed / 1024 / 1024),
        maxHeapSizeMB: Math.round(maxHeapSize / 1024 / 1024),
        usagePercent: Math.round(heapUsedPercent),
      });
    }
  }, MONITORING_INTERVAL_MS);

  interval.unref(); // Don't keep the event loop alive just for this timer
  logger.info('Heap monitoring started', {
    maxHeapSizeMB: Math.round(maxHeapSize / 1024 / 1024),
    warningThresholdMB: Math.round(warningThreshold / 1024 / 1024),
  });
}

module.exports = { startHeapMonitoring };
