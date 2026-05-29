'use strict';

const client = require('prom-client');

const registry = new client.Registry();

client.collectDefaultMetrics({ register: registry });

// payments_total{status} — queried live from MongoDB on each scrape so the
// count is accurate even after a process restart (counters would reset to 0).
new client.Gauge({
  name: 'payments_total',
  help: 'Number of payments grouped by status',
  labelNames: ['status'],
  registers: [registry],
  async collect() {
    try {
      const Payment = require('../models/paymentModel');
      const counts = await Payment.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);
      this.reset();
      for (const { _id, count } of counts) {
        this.set({ status: _id }, count);
      }
    } catch (_) {
      // DB may not be ready yet — scrape still succeeds with stale/zero values
    }
  },
});

// sync_duration_seconds — recorded per manual sync operation in paymentController
const syncDurationSeconds = new client.Histogram({
  name: 'sync_duration_seconds',
  help: 'Duration of payment sync operations in seconds',
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [registry],
});

// queue_depth{queue} — queried live from BullMQ on each scrape.
// Tracks actionable (non-completed) jobs: waiting + active + delayed.
new client.Gauge({
  name: 'queue_depth',
  help: 'Number of actionable jobs in each BullMQ queue (waiting + active + delayed)',
  labelNames: ['queue'],
  registers: [registry],
  async collect() {
    try {
      const { getQueueStats, getDLQStats } = require('../queue/transactionRetryQueue');
      const [retryResult, dlqResult] = await Promise.allSettled([
        getQueueStats(),
        getDLQStats(),
      ]);

      this.reset();

      if (retryResult.status === 'fulfilled' && retryResult.value?.metrics) {
        const m = retryResult.value.metrics;
        this.set(
          { queue: 'transaction-retry' },
          (m.waiting || 0) + (m.active || 0) + (m.delayed || 0)
        );
      }

      if (dlqResult.status === 'fulfilled' && dlqResult.value?.enabled) {
        const m = dlqResult.value.metrics;
        this.set({ queue: 'transaction-dead-letter' }, m.waiting || 0);
      }
    } catch (_) {
      // Redis may not be configured — scrape still succeeds
    }
  },
});

// http_request_duration_seconds{method,route,status} — recorded per request
// in the requestLogger middleware, which already captures these fields.
const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

module.exports = { registry, syncDurationSeconds, httpRequestDurationSeconds };
