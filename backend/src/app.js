'use strict';

require('dotenv').config();
const config = require('./config');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');

const studentRoutes = require('./routes/studentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const feeRoutes = require('./routes/feeRoutes');
const reportRoutes = require('./routes/reportRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const disputeRoutes = require('./routes/disputeRoutes');
const sourceValidationRuleRoutes = require('./routes/sourceValidationRuleRoutes');
const receiptsRoutes = require('./routes/receiptsRoutes');
const feeAdjustmentRoutes = require('./routes/feeAdjustmentRoutes');
const adminRoutes = require('./routes/adminRoutes');

const { registerPaymentSavedSubscribers } = require('./services/paymentSavedSubscribers');
const { startPolling, stopPolling } = require('./services/transactionPollingService');
const retrySelector = require('./services/retryServiceSelector');
const { startConsistencyScheduler } = require('./services/consistencyScheduler');
const { startReminderScheduler, stopReminderScheduler } = require('./services/reminderService');
const { startWorker: startTxQueueWorker, stopWorker: stopTxQueueWorker } = require('./services/transactionQueueService');
const { startSessionCleanupScheduler, stopSessionCleanupScheduler } = require('./services/sessionCleanupService');
const { initializeRetryQueue, setupMonitoring } = require('./config/retryQueueSetup');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const { createConcurrentRequestMiddleware } = require('./middleware/concurrentRequestHandler');
const { runConsistencyCheck } = require('./controllers/consistencyController');
const { healthCheck } = require('./controllers/healthController');
const logger = require('./utils/logger');

const morgan = require('morgan');
const { parseAllowedOrigins } = require('./utils/corsOrigins');

const allowedOrigins = parseAllowedOrigins();

const app = express();

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-School-ID', 'Idempotency-Key'],
}));
// The backend serves only JSON API responses — no HTML, scripts, or styles.
// CSP directives for HTML content (scriptSrc, styleSrc, imgSrc, etc.) are
// irrelevant here and have been removed. The frontend (Next.js) owns those.
// We keep only the directives that are meaningful for an API endpoint.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(express.json({ limit: config.MAX_BODY_SIZE }));
app.use(requestLogger());

const concurrentMiddleware = createConcurrentRequestMiddleware({
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000, halfOpenSuccessThreshold: 2 },
  queue: { maxConcurrent: 50, maxSize: 1000, defaultTimeoutMs: 30000 },
  rateLimit: { windowMs: 60000, maxRequests: 100 },
  deduplicationTtlMs: 60000,
});
app.use(concurrentMiddleware.rateLimiter((req) => req.ip));
app.use(concurrentMiddleware.requestQueue());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/schools', schoolRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/source-rules', sourceValidationRuleRoutes);
app.use('/api/receipts', receiptsRoutes);
app.use('/api/fee-adjustments', feeAdjustmentRoutes);
app.use('/api/admin', adminRoutes);
app.get('/api/consistency', runConsistencyCheck);
app.get('/health', healthCheck);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

// ── Database + service startup ────────────────────────────────────────────────
async function connectWithRetry(maxAttempts = 5, baseDelayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await mongoose.connect(config.MONGO_URI);
      logger.info('MongoDB connected');
      return;
    } catch (err) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1); // exponential backoff
      logger.error(`MongoDB connection attempt ${attempt}/${maxAttempts} failed`, {
        error: err.message,
        retryInMs: attempt < maxAttempts ? delay : null,
      });
      if (attempt === maxAttempts) {
        logger.error('Exhausted all MongoDB connection attempts — exiting');
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Log disconnections after successful startup
mongoose.connection.on('disconnected', () =>
  logger.warn('MongoDB disconnected — waiting for reconnect')
);
mongoose.connection.on('reconnected', () =>
  logger.info('MongoDB reconnected')
);
mongoose.connection.on('error', (err) =>
  logger.error('MongoDB connection error', { error: err.message })
);

connectWithRetry().then(async () => {
  // Seed default system config entries on first run
  const SystemConfig = require('./models/systemConfigModel');
  const DEFAULTS = [
    { key: 'maintenanceMode',    value: false },
    { key: 'maxSyncBatchSize',   value: 20 },
    { key: 'reminderEnabled',    value: true },
    { key: 'reminderIntervalMs', value: 86400000 },
  ];
  await Promise.all(
    DEFAULTS.map(({ key, value }) =>
      SystemConfig.findOneAndUpdate({ key }, { $setOnInsert: { key, value } }, { upsert: true })
    )
  );
  logger.info('System config defaults ensured');

  startPolling();
  startConsistencyScheduler();
  retrySelector.start();
  startTxQueueWorker();
  startReminderScheduler();
  startSessionCleanupScheduler();
  registerPaymentSavedSubscribers();

  // Only initialise BullMQ when Redis is configured
  if (retrySelector.useBullMQ()) {
    try {
      await initializeRetryQueue(app);
      setupMonitoring(60000);
      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize retry queue system', { error: error.message });
    }
  } else {
    logger.info('All services initialized successfully (MongoDB retry backend)');
  }
});

// ── Server ────────────────────────────────────────────────────────────────────
const PORT = config.PORT;
const server = require.main === module
  ? app.listen(PORT, () => logger.info(`Server running on port ${PORT}`))
  : { close: (cb) => cb && cb() };

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`Received ${signal} signal — starting graceful shutdown`);

  const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 10_000;

  // Stop background services — no new work accepted
  stopPolling();
  retrySelector.stop();
  stopTxQueueWorker();
  stopReminderScheduler();
  stopSessionCleanupScheduler();

  // Force exit after SHUTDOWN_TIMEOUT_MS regardless of in-flight requests
  const forceExitTimer = setTimeout(() => {
    logger.error(`Forced exit after ${SHUTDOWN_TIMEOUT_MS}ms shutdown timeout`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref(); // don't keep the event loop alive just for this timer

  // (1) Stop accepting new connections; (2) wait for in-flight requests to finish;
  // (3) only then close the database connection.
  server.close(async () => {
    try {
      await mongoose.disconnect();
      logger.info('MongoDB disconnected — clean exit');
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (err) {
      logger.error('Error closing MongoDB', { error: err.message });
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
