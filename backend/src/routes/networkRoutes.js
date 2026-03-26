'use strict';

const express = require('express');
const router = express.Router();
const { networkMonitor } = require('../services/network-monitor.service');
const logger = require('../utils/logger').child('NetworkRoutes');

/**
 * GET /api/v1/network/status
 * Get current network status and health information
 */
router.get('/status', async (req, res, next) => {
  try {
    const status = networkMonitor.getNetworkStatus();
    
    // Add additional computed fields
    const response = {
      ...status,
      timestamp: new Date().toISOString(),
      uptimeFormatted: formatUptime(status.uptime),
      healthScore: calculateHealthScore(status),
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Failed to get network status', { error: error.message });
    next(error);
  }
});

/**
 * POST /api/v1/network/force-failover
 * Force failover for testing purposes (development only)
 */
router.post('/force-failover', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ 
      error: 'Force failover not allowed in production',
      code: 'FORBIDDEN' 
    });
  }
  
  try {
    await networkMonitor.forceFailover();
    res.json({ 
      message: 'Failover initiated',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    logger.error('Failed to force failover', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/v1/network/health
 * Simple health check endpoint
 */
router.get('/health', async (req, res) => {
  const status = networkMonitor.getNetworkStatus();
  const isHealthy = status.status === 'healthy';
  
  res.status(isHealthy ? 200 : 503).json({
    healthy: isHealthy,
    status: status.status,
    server: status.currentServer,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Format uptime in human-readable format
 */
function formatUptime(uptimeMs) {
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Calculate health score based on various metrics
 */
function calculateHealthScore(status) {
  let score = 100;
  
  // Deduct points for various issues
  if (status.status !== 'healthy') score -= 50;
  if (status.isUsingBackup) score -= 20;
  if (status.congestionLevel === 'moderate') score -= 10;
  if (status.congestionLevel === 'high') score -= 25;
  if (status.transactionFailureRate > 0.05) score -= 15; // 5% threshold
  if (status.transactionFailureRate > 0.1) score -= 25; // 10% threshold
  
  // Deduct points for recent errors
  const recentErrors = status.errors.filter(error => {
    const errorTime = new Date(error.timestamp);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return errorTime > fiveMinutesAgo;
  });
  
  score -= recentErrors.length * 5;
  
  return Math.max(0, Math.min(100, score));
}

module.exports = router;