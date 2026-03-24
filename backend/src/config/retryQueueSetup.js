/**
 * Retry Queue Setup and Initialization
 * 
 * This module handles the startup and integration of the BullMQ
 * retry queue system with the main application.
 */

const bullMQRetryService = require('../services/bullMQRetryService');
const retryQueueRoutes = require('../routes/retryQueueRoutes');

let isInitialized = false;

/**
 * Initialize the retry queue system
 */
async function initializeRetryQueue(app) {
  if (isInitialized) {
    console.log('[RetryQueueSetup] Already initialized');
    return;
  }
  
  try {
    console.log('[RetryQueueSetup] Starting initialization...');
    
    // Initialize the BullMQ queue system
    await bullMQRetryService.initializeRetryQueue();
    
    console.log('[RetryQueueSetup] BullMQ queue system initialized');
    
    // Register routes if app is provided
    if (app) {
      app.use('/api/retry-queue', retryQueueRoutes);
      console.log('[RetryQueueSetup] Routes registered at /api/retry-queue');
    }
    
    // Setup graceful shutdown
    setupGracefulShutdown();
    
    isInitialized = true;
    console.log('[RetryQueueSetup] Initialization complete');
    
    return {
      success: true,
      message: 'Retry queue system initialized successfully',
    };
    
  } catch (error) {
    console.error('[RetryQueueSetup] Initialization failed:', error);
    throw error;
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown() {
  const { shutdownQueue } = bullMQRetryService;
  
  // Handle process termination
  process.on('SIGTERM', async () => {
    console.log('[RetryQueueSetup] SIGTERM received, shutting down gracefully...');
    await gracefulShutdown();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('[RetryQueueSetup] SIGINT received, shutting down gracefully...');
    await gracefulShutdown();
    process.exit(0);
  });
  
  process.on('uncaughtException', async (error) => {
    console.error('[RetryQueueSetup] Uncaught exception:', error);
    await gracefulShutdown();
    process.exit(1);
  });
  
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('[RetryQueueSetup] Unhandled rejection at:', promise, 'reason:', reason);
    // Don't exit for unhandled rejections, just log them
  });
}

/**
 * Graceful shutdown function
 */
async function gracefulShutdown() {
  try {
    console.log('[RetryQueueSetup] Starting graceful shutdown...');
    
    // Get final stats before shutdown
    const stats = await bullMQRetryService.getRetryQueueStats();
    console.log('[RetryQueueSetup] Final queue stats:', stats);
    
    // Shutdown the queue system
    await bullMQRetryService.shutdownQueue();
    
    console.log('[RetryQueueSetup] Graceful shutdown complete');
    
  } catch (error) {
    console.error('[RetryQueueSetup] Error during graceful shutdown:', error);
  }
}

/**
 * Get system status
 */
async function getSystemStatus() {
  try {
    const health = await bullMQRetryService.getHealthStatus();
    const stats = await bullMQRetryService.getRetryQueueStats();
    
    return {
      initialized: isInitialized,
      health,
      stats,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    return {
      initialized: isInitialized,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Setup periodic health checks and monitoring
 */
function setupMonitoring(intervalMs = 60000) {
  console.log(`[RetryQueueSetup] Setting up monitoring with ${intervalMs}ms interval`);
  
  setInterval(async () => {
    try {
      const health = await bullMQRetryService.getHealthStatus();
      
      if (!health.healthy) {
        console.warn('[RetryQueueSetup] Unhealthy status detected:', health);
        // Could send alerts here
      }
      
      // Log periodic stats
      const stats = await bullMQRetryService.getRetryQueueStats();
      console.log('[RetryQueueSetup] Periodic stats:', {
        totalJobs: stats.bullmq.metrics.totalJobs,
        activeJobs: stats.bullmq.metrics.active,
        health: stats.systemHealth.queueHealth,
      });
      
    } catch (error) {
      console.error('[RetryQueueSetup] Error during periodic monitoring:', error);
    }
  }, intervalMs);
}

module.exports = {
  initializeRetryQueue,
  getSystemStatus,
  setupGracefulShutdown,
  setupMonitoring,
  gracefulShutdown,
};
