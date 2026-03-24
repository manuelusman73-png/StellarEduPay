require('dotenv').config();
const config = require('./config');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const studentRoutes = require('./routes/studentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const feeRoutes = require('./routes/feeRoutes');
const reportRoutes = require('./routes/reportRoutes');
const { startPolling } = require('./services/transactionService');
const { startRetryWorker } = require('./services/retryService');
const { initializeRetryQueue, setupMonitoring } = require('./config/retryQueueSetup');

const app = express();

app.use(cors());
app.use(express.json());

// MongoDB connection and service startup
mongoose.connect(config.MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected');
    
    // Start existing services
    startPolling();
    startRetryWorker();
    
    // Initialize BullMQ retry queue system
    try {
      await initializeRetryQueue(app);
      
      // Setup periodic monitoring (every 60 seconds)
      setupMonitoring(60000);
      
      console.log('All services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize retry queue system:', error);
      // Don't crash the app if BullMQ fails - continue with existing retry service
    }
  })
  .catch(err => console.error('MongoDB error:', err));

app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/reports', reportRoutes);
// BullMQ retry queue routes are registered by initializeRetryQueue()

app.get('/health', async (req, res) => {
  try {
    const { getSystemStatus } = require('./config/retryQueueSetup');
    const retryQueueStatus = await getSystemStatus();
    
    res.json({ 
      status: 'ok',
      retryQueue: retryQueueStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ 
      status: 'ok',
      retryQueue: { error: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

// Global error handler — all controllers forward errors here via next(err)
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const statusMap = {
    TX_FAILED: 400,
    MISSING_MEMO: 400,
    INVALID_DESTINATION: 400,
    UNSUPPORTED_ASSET: 400,
    DUPLICATE_TX: 409,
    NOT_FOUND: 404,
    VALIDATION_ERROR: 400,
    STELLAR_NETWORK_ERROR: 502,
  };
  const status = statusMap[err.code] || err.status || 500;
  console.error(`[${err.code || 'ERROR'}] ${err.message}`);
  res.status(status).json({ error: err.message, code: err.code || 'INTERNAL_ERROR' });
});

const PORT = config.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
