'use strict';

require('dotenv').config();
const config = require('./config');
const express = require('express');
const cors = require('cors');

const schoolRoutes   = require('./routes/schoolRoutes');
const studentRoutes  = require('./routes/studentRoutes');
const paymentRoutes  = require('./routes/paymentRoutes');
const feeRoutes      = require('./routes/feeRoutes');
const reportRoutes   = require('./routes/reportRoutes');
const { runConsistencyCheck } = require('./controllers/consistencyController');
const { startPolling, stopPolling } = require('./services/transactionService');
const { startRetryWorker, stopRetryWorker, isRetryWorkerRunning } = require('./services/retryService');
const { startConsistencyScheduler } = require('./services/consistencyScheduler');
const { initializeRetryQueue, setupMonitoring } = require('./config/retryQueueSetup');
const database = require('./config/database');
const { concurrentPaymentProcessor } = require('./services/concurrentPaymentProcessor');
const { createConcurrentRequestMiddleware } = require('./middleware/concurrentRequestHandler');

const app = express();

app.use(cors());
app.use(express.json());

// Create concurrent request handling middleware
const concurrentMiddleware = createConcurrentRequestMiddleware({
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    halfOpenSuccessThreshold: 2
  },
  queue: {
    maxConcurrent: 50,
    maxSize: 1000,
    defaultTimeoutMs: 30000
  },
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100
  },
  deduplicationTtlMs: 60000
});

// Apply request queue middleware globally
app.use(concurrentMiddleware.requestQueue());

// ── Graceful Shutdown Handler ────────────────────────────────────────────────────
async function gracefulShutdown(signal) {
  console.log(`[App] ${signal} received, shutting down gracefully`);
  
  stopPolling();
  startRetryWorker && startRetryWorker.stop && startRetryWorker.stop();
  
  try {
    await database.disconnect();
    console.log('[App] Database disconnected');
  } catch (error) {
    console.error('[App] Error disconnecting database:', error.message);
  }
  
  process.exit(0);
}

// MongoDB connection with enhanced configuration
async function initializeDatabase() {
  try {
    await database.connect();
    console.log('MongoDB connected with connection pooling');
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    return false;
  }
}

// Initialize services
async function initializeServices() {
  // Start existing services
  startPolling();
  startRetryWorker();
  
  // Initialize BullMQ retry queue system
  try {
    await initializeRetryQueue(app);
    setupMonitoring(60000);
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize retry queue system:', error);
    // Don't crash the app if BullMQ fails - continue with existing retry service
  }
}

// ── Startup ─────────────────────────────────────────────────────────────────────
async function startApp() {
  const dbConnected = await initializeDatabase();
  
  if (!dbConnected) {
    console.error('Failed to connect to database. Exiting...');
    process.exit(1);
  }
  
  await initializeServices();
  
  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  console.log('Application startup complete');
}

// Start the application
startApp();
// MongoDB connection and service startup
// ── Request timeout ───────────────────────────────────────────────────────────
// If a response has not been sent within REQUEST_TIMEOUT_MS, reply 503.
app.use((req, res, next) => {
  res.setTimeout(config.REQUEST_TIMEOUT_MS, () => {
    const err = new Error(`Request timed out after ${config.REQUEST_TIMEOUT_MS}ms`);
    err.code = 'REQUEST_TIMEOUT';
    next(err);
  });
  next();
});

mongoose.connect(config.MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected');

    // Start existing services
    startPolling();
    startConsistencyScheduler();
    startRetryWorker();

    // Initialize BullMQ retry queue system
    try {
      await initializeRetryQueue(app);
      setupMonitoring(60000);
      console.log('All services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize retry queue system:', error);
    }
  })
  .catch(err => console.error('MongoDB error:', err));

// Schools — no school context needed (these ARE schools)
app.use('/api/schools', schoolRoutes);

// All other routes are school-scoped (resolveSchool middleware is applied in each router)
app.use('/api/students',  studentRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/fees',      feeRoutes);
app.use('/api/reports',   reportRoutes);
app.get('/api/consistency', runConsistencyCheck);

app.get('/health', async (req, res) => {
  try {
    const { getSystemStatus } = require('./config/retryQueueSetup');
    const retryQueueStatus = await getSystemStatus();
    res.json({
      status: 'ok',
      retryQueue: retryQueueStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.json({
      status: 'ok',
      retryQueue: { error: error.message },
      timestamp: new Date().toISOString(),
    });
  }
});

// Global error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const statusMap = {
    TX_FAILED:              400,
    MISSING_MEMO:           400,
    INVALID_DESTINATION:    400,
    UNSUPPORTED_ASSET:      400,
    VALIDATION_ERROR:       400,
    MISSING_SCHOOL_CONTEXT: 400,
    MISSING_IDEMPOTENCY_KEY:400,
    DUPLICATE_TX:           409,
    DUPLICATE_SCHOOL:       409,
    DUPLICATE_STUDENT:      409,
    NOT_FOUND:              404,
    SCHOOL_NOT_FOUND:       404,
    STELLAR_NETWORK_ERROR:  502,
    REQUEST_TIMEOUT:        503,
  };
  const status = statusMap[err.code] || err.status || 500;
  console.error(`[${err.code || 'ERROR'}] ${err.message}`);
  res.status(status).json({ error: err.message, code: err.code || 'INTERNAL_ERROR' });
});

const PORT = config.PORT;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ── Graceful shutdown ──────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`[Shutdown] Received ${signal} — starting graceful shutdown`);

  stopPolling();
  stopRetryWorker();

  const deadline = Date.now() + 8_000;
  while (isRetryWorkerRunning() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log('[Shutdown] MongoDB disconnected — clean exit');
      process.exit(0);
    } catch (err) {
      console.error('[Shutdown] Error closing MongoDB:', err.message);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app;
