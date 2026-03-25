/**
 * Retry Queue Controller
 * 
 * REST API endpoints for managing the transaction retry queue system.
 * Provides monitoring, administration, and debugging capabilities.
 */

const {
  getRetryQueueStats,
  getJobDetails,
  getJobsByState,
  retryJobImmediately,
  removeJob,
  pauseQueue,
  resumeQueue,
  getHealthStatus,
  queueFailedTransaction,
} = require('../services/bullMQRetryService');

/**
 * Get comprehensive queue statistics and health
 */
async function getStats(req, res) {
  try {
    const stats = await getRetryQueueStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get queue health status
 */
async function getHealth(req, res) {
  try {
    const health = await getHealthStatus();
    const statusCode = health.healthy ? 200 : 503;
    
    res.status(statusCode).json({
      success: true,
      data: health,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get specific job details
 */
async function getJob(req, res) {
  try {
    const { jobId } = req.params;
    const job = await getJobDetails(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: `Job ${jobId} not found`,
      });
    }
    
    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get jobs by state
 */
async function getJobs(req, res) {
  try {
    const { state } = req.params;
    const { limit } = req.query;
    
    const jobs = await getJobsByState(state, parseInt(limit) || 50);
    
    res.json({
      success: true,
      data: {
        state,
        count: jobs.length,
        jobs,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Manually retry a failed job
 */
async function manualRetry(req, res) {
  try {
    const { jobId } = req.params;
    const result = await retryJobImmediately(jobId);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Remove a job from the queue
 */
async function deleteJob(req, res) {
  try {
    const { jobId } = req.params;
    const result = await removeJob(jobId);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Pause the queue
 */
async function pause(req, res) {
  try {
    const result = await pauseQueue();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Resume the queue
 */
async function resume(req, res) {
  try {
    const result = await resumeQueue();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Manually queue a transaction for retry
 */
async function queueTransaction(req, res) {
  try {
    const { transactionHash, studentId, memo, error, metadata } = req.body;
    
    if (!transactionHash) {
      return res.status(400).json({
        success: false,
        error: 'transactionHash is required',
      });
    }
    
    const result = await queueFailedTransaction(transactionHash, {
      studentId,
      memo,
      error: error ? new Error(error.message) : null,
      metadata,
    });
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

module.exports = {
  getStats,
  getHealth,
  getJob,
  getJobs,
  manualRetry,
  deleteJob,
  pause,
  resume,
  queueTransaction,
};
