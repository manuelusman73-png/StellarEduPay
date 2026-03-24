/**
 * Retry Queue Routes
 * 
 * API endpoints for managing the transaction retry queue system.
 */

const express = require('express');
const {
  getStats,
  getHealth,
  getJob,
  getJobs,
  manualRetry,
  deleteJob,
  pause,
  resume,
  queueTransaction,
} = require('../controllers/retryQueueController');

const router = express.Router();

// Queue statistics and monitoring
router.get('/stats', getStats);
router.get('/health', getHealth);

// Job management
router.get('/jobs/:jobId', getJob);
router.get('/jobs/state/:state', getJobs);
router.post('/jobs/:jobId/retry', manualRetry);
router.delete('/jobs/:jobId', deleteJob);

// Queue control
router.post('/pause', pause);
router.post('/resume', resume);

// Manual transaction queuing
router.post('/queue', queueTransaction);

module.exports = router;
