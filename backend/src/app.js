'use strict';

require('dotenv').config();
const config  = require('./config');
const express = require('express');
const cors    = require('cors');
const mongoose = require('mongoose');

const studentRoutes  = require('./routes/studentRoutes');
const paymentRoutes  = require('./routes/paymentRoutes');
const feeRoutes      = require('./routes/feeRoutes');
const reportRoutes   = require('./routes/reportRoutes');
const schoolRoutes   = require('./routes/schoolRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const disputeRoutes  = require('./routes/disputeRoutes');

const { startPolling, stopPolling }                                   = require('./services/transactionService');
const { startRetryWorker, stopRetryWorker, isRetryWorkerRunning }     = require('./services/retryService');
const { startConsistencyScheduler }                                   = require('./services/consistencyScheduler');
const { startReminderScheduler, stopReminderScheduler }               = require('./services/reminderService');
const { startWorker: startTxQueueWorker, stopWorker: stopTxQueueWorker } = require('./services/transactionQueueService');
const { initializeRetryQueue, setupMonitoring }                       = require('./config/retryQueueSetup');
const { notFoundHandler }                                             = require('./middleware/errorHandler');
const { requestLogger }                                               = require('./middleware/requestLogger');
const { createConcurrentRequestMiddleware }                           = require('./middleware/concurrentRequestHandler');
const { runConsistencyCheck }                                         = require('./controllers/consistencyController');
const { healthCheck }                                                 = require('./controllers/healthController');
const logger                                                          = require('./utils/logger');

const morgan = require('morgan');

const app = express();

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-School-ID', 'Idempotency-Key'],
}));
app.use(express.json());
app.use(requestLogger());

const concurrentMiddleware = createConcurrentRequestMiddleware({
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000, halfOpenSuccessThreshold: 2 },
  queue:          { maxConcurrent: 50, maxSize: 1000, defaultTimeoutMs: 30000 },
  rateLimit:      { windowMs: 60000, maxRequests: 100 },
  deduplicationTtlMs: 60000,
});
app.use(concurrentMiddleware.rateLimiter((req) => req.ip));
app.use(concurrentMiddleware.requestQueue());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/schools',   schoolRoutes);
app.use('/api/students',  studentRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/fees',      feeRoutes);
app.use('/api/reports',   reportRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/disputes',  disputeRoutes);
app.get('/api/consistency', runConsistencyCheck);
app.get('/health', healthCheck);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const statusMap = {
    TX_FAILED:               400,
    MISSING_MEMO:            400,
    INVALID_DESTINATION:     400,
    UNSUPPORTED_ASSET:       400,
    VALIDATION_ERROR:        400,
    UNDERPAID:               400,
    MISSING_SCHOOL_CONTEXT:  400,
    MISSING_IDEMPOTENCY_KEY: 400,
    DUPLICATE_TX:            409,
    DUPLICATE_SCHOOL:        409,
    DUPLICATE_STUDENT:       409,
    NOT_FOUND:               404,
    SCHOOL_NOT_FOUND:        404,
    STELLAR_NETWORK_ERROR:   502,
    REQUEST_TIMEOUT:         503,
  };
  const status = statusMap[err.code] || err.status || 500;
  logger.error('Request error', { code: err.code || 'INTERNAL_ERROR', message: err.message, status });
  res.status(status).json({ error: err.message, code: err.code || 'INTERNAL_ERROR' });
});

// ── Database + service startup ────────────────────────────────────────────────
mongoose.connect(config.MONGO_URI)
  .then(async () => {
    logger.info('MongoDB connected');
    startPolling();
    startConsistencyScheduler();
    startRetryWorker();
    startTxQueueWorker();
    startReminderScheduler();

    try {
      await initializeRetryQueue(app);
      setupMonitoring(60000);
      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize retry queue system', { error: error.message });
    }
  })
  .catch(err => logger.error('MongoDB error', { error: err.message }));

// ── Server ────────────────────────────────────────────────────────────────────
const PORT = config.PORT;
const server = require.main === module
  ? app.listen(PORT, () => logger.info(`Server running on port ${PORT}`))
  : { close: (cb) => cb && cb() };

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`Received ${signal} — starting graceful shutdown`);

  stopPolling();
  stopRetryWorker();
  stopTxQueueWorker();
  stopReminderScheduler();

  const deadline = Date.now() + 8_000;
  while (isRetryWorkerRunning() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  server.close(async () => {
    try {
      await mongoose.disconnect();
      logger.info('MongoDB disconnected — clean exit');
      process.exit(0);
    } catch (err) {
      logger.error('Error closing MongoDB', { error: err.message });
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('Forced exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app;
