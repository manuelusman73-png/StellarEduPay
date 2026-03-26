'use strict';

require('dotenv').config();
const config = require('./config');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const schoolRoutes   = require('./routes/schoolRoutes');
const studentRoutes  = require('./routes/studentRoutes');
const paymentRoutes  = require('./routes/paymentRoutes');
const feeRoutes      = require('./routes/feeRoutes');
const reportRoutes   = require('./routes/reportRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const disputeRoutes  = require('./routes/disputeRoutes');
const { runConsistencyCheck } = require('./controllers/consistencyController');
const { startPolling, stopPolling } = require('./services/transactionPollingService');
const { startRetryWorker, stopRetryWorker, isRetryWorkerRunning } = require('./services/retryService');
const { startConsistencyScheduler } = require('./services/consistencyScheduler');
const { startReminderScheduler, stopReminderScheduler } = require('./services/reminderService');
const { initializeRetryQueue, setupMonitoring } = require('./config/retryQueueSetup');
const { startWorker: startTxQueueWorker, stopWorker: stopTxQueueWorker } = require('./services/transactionQueueService');
const { initializeRetryQueue, setupMonitoring, getSystemStatus } = require('./config/retryQueueSetup');
const database = require('./config/database');
const { concurrentPaymentProcessor } = require('./services/concurrentPaymentProcessor');
const { createConcurrentRequestMiddleware } = require('./middleware/concurrentRequestHandler');
const { requestLogger } = require('./middleware/requestLogger');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger());

// Concurrent request handling middleware
const concurrentMiddleware = createConcurrentRequestMiddleware({
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    halfOpenSuccessThreshold: 2,
  },
  queue: {
    maxConcurrent: 50,
    maxSize: 1000,
    defaultTimeoutMs: 30000,
  },
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
  },
  deduplicationTtlMs: 60000,
});

app.use(concurrentMiddleware.rateLimiter((req) => req.ip));
app.use(concurrentMiddleware.requestQueue());

app.use((req, res, next) => {
  res.setTimeout(config.REQUEST_TIMEOUT_MS, () => {
    const err = new Error(`Request timed out after ${config.REQUEST_TIMEOUT_MS}ms`);
    err.code = 'REQUEST_TIMEOUT';
    next(err);
  });
  next();
});

async function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  
  stopPolling();
  if (startRetryWorker && startRetryWorker.stop) {
    startRetryWorker.stop();
  }
  
  try {
    await database.disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Error disconnecting database', { error: error.message });
  }
  
  process.exit(0);
}

async function initializeDatabase() {
  try {
    await database.connect();
    logger.info('MongoDB connected with connection pooling');
    return true;
  } catch (error) {
    logger.error('MongoDB connection error', { error: error.message });
    return false;
  }
}

async function initializeServices() {
  startPolling();
  startConsistencyScheduler();
  startRetryWorker();
  startTxQueueWorker();

  // Initialize BullMQ retry queue system

  try {
    await initializeRetryQueue(app);
    setupMonitoring(60000);
    logger.info('All services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize retry queue system:', error);
  }
}

    logger.error('Failed to initialize retry queue system', { error: error.message });
    // Don't crash the app if BullMQ fails - continue with existing retry service
  }
}

// ── Startup ─────────────────────────────────────────────────────────────────────
async function startApp() {
  const dbConnected = await initializeDatabase();
  
  if (!dbConnected) {
    logger.error('Failed to connect to database. Exiting...');
    process.exit(1);
  }
  
  await initializeServices();
  
  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  logger.info('Application startup complete');
}

// Start the application
startApp();
// MongoDB connection and service startup
// ── Request timeout ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setTimeout(config.REQUEST_TIMEOUT_MS, () => {
    const err = new Error(`Request timed out after ${config.REQUEST_TIMEOUT_MS}ms`);
    err.code = 'REQUEST_TIMEOUT';
    next(err);
  });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/schools',   schoolRoutes);
mongoose.connect(config.MONGO_URI)
  .then(async () => {
    logger.info('MongoDB connected');

    // Start existing services
    startPolling();
    startConsistencyScheduler();
    startRetryWorker();

    // Initialize BullMQ retry queue system
    try {
      await initializeRetryQueue(app);
      setupMonitoring(60000);
      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize retry queue system', { error: error.message });
    }
  })
  .catch(err => logger.error('MongoDB error', { error: err.message }));

// Schools — no school context needed (these ARE schools)
app.use('/api/schools', schoolRoutes);
app.use('/api/students',  studentRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/fees',      feeRoutes);
app.use('/api/reports',   reportRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/disputes', disputeRoutes);
app.get('/api/consistency', runConsistencyCheck);

app.get('/health', async (req, res) => {
  try {
    const retryQueueStatus = await getSystemStatus();
    res.json({
      status: 'ok',
      network: config.STELLAR_NETWORK,
      horizonUrl: config.HORIZON_URL,
      retryQueue: retryQueueStatus,
      timestamp: new Date.now().toISOString(),
    });
  } catch (error) {
    res.json({
      status: 'ok',
      network: config.STELLAR_NETWORK,
      horizonUrl: config.HORIZON_URL,
      retryQueue: { error: error.message },
      timestamp: new Date.now().toISOString(),
    });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(globalErrorHandler);
app.use((err, req, res, next) => {
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

async function startApp() {
  const dbConnected = await initializeDatabase();
  
  if (!dbConnected) {
    console.error('Failed to connect to database. Exiting...');
const PORT = config.PORT;
const server = app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`Received ${signal} — starting graceful shutdown`);

  stopPolling();
  stopRetryWorker();
  await stopTxQueueWorker();
  stopReminderScheduler();

  const deadline = Date.now() + 8_000;
  while (isRetryWorkerRunning() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  server.close(async () => {
    try {
      await mongoose.connection.close();
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
  }
  
  await initializeServices();
  
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  const PORT = config.PORT;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  
  console.log('Application startup complete');
}

startApp();

module.exports = app;
