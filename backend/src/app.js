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

const { startPolling, stopPolling } = require('./services/transactionService');
const { startRetryWorker, stopRetryWorker, isRetryWorkerRunning } = require('./services/retryService');
const { startConsistencyScheduler } = require('./services/consistencyScheduler');
const { startReminderScheduler, stopReminderScheduler } = require('./services/reminderService');
const { startWorker: startTxQueueWorker, stopWorker: stopTxQueueWorker } = require('./services/transactionQueueService');
const { initializeRetryQueue, setupMonitoring } = require('./config/retryQueueSetup');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const { createConcurrentRequestMiddleware } = require('./middleware/concurrentRequestHandler');
const { runConsistencyCheck } = require('./controllers/consistencyController');
const { healthCheck } = require('./controllers/healthController');
const logger = require('./utils/logger');

const morgan = require('morgan');

const app = express();

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-School-ID', 'Idempotency-Key'],
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" },
}));
app.use(express.json());
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
});

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
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
