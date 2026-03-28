'use strict';

const logger = require('../utils/logger').child('MetricsService');

// In-memory metrics storage (in production, this would use Redis or a proper metrics system)
const metrics = {
  staleDataPrevention: {
    totalAttempts: 0,
    preventedCount: 0,
    lastPrevented: null,
    averageAge: 0,
    maxAge: 0
  },
  performance: {
    validationTime: [],
    totalValidations: 0
  }
};

/**
 * Record a stale data prevention event
 * 
 * @param {object} details - Stale data error details
 */
function recordStaleDataPrevention(details) {
  metrics.staleDataPrevention.totalAttempts++;
  metrics.staleDataPrevention.preventedCount++;
  metrics.staleDataPrevention.lastPrevented = new Date();
  
  if (details.ageSeconds) {
    const currentAvg = metrics.staleDataPrevention.averageAge;
    const count = metrics.staleDataPrevention.preventedCount;
    metrics.staleDataPrevention.averageAge = ((currentAvg * (count - 1)) + details.ageSeconds) / count;
    
    if (details.ageSeconds > metrics.staleDataPrevention.maxAge) {
      metrics.staleDataPrevention.maxAge = details.ageSeconds;
    }
  }
  
  logger.info('Stale data prevention recorded', {
    totalAttempts: metrics.staleDataPrevention.totalAttempts,
    preventedCount: metrics.staleDataPrevention.preventedCount,
    ageSeconds: details.ageSeconds,
    limitSeconds: details.limitSeconds
  });
  
  // Alert if we're seeing unusual patterns
  if (metrics.staleDataPrevention.preventedCount % 10 === 0) {
    logger.warn('High frequency of stale data attempts detected', {
      preventedCount: metrics.staleDataPrevention.preventedCount,
      averageAge: Math.round(metrics.staleDataPrevention.averageAge),
      maxAge: metrics.staleDataPrevention.maxAge
    });
  }
}

/**
 * Record validation performance metrics
 * 
 * @param {number} durationMs - Validation duration in milliseconds
 */
function recordValidationPerformance(durationMs) {
  metrics.performance.totalValidations++;
  metrics.performance.validationTime.push(durationMs);
  
  // Keep only last 1000 measurements
  if (metrics.performance.validationTime.length > 1000) {
    metrics.performance.validationTime.shift();
  }
}

/**
 * Get current metrics summary
 * 
 * @returns {object} - Current metrics
 */
function getMetrics() {
  const validationTimes = metrics.performance.validationTime;
  const avgValidationTime = validationTimes.length > 0
    ? validationTimes.reduce((sum, time) => sum + time, 0) / validationTimes.length
    : 0;
  
  return {
    staleDataPrevention: {
      ...metrics.staleDataPrevention,
      preventionRate: metrics.staleDataPrevention.totalAttempts > 0
        ? (metrics.staleDataPrevention.preventedCount / metrics.staleDataPrevention.totalAttempts) * 100
        : 0
    },
    performance: {
      totalValidations: metrics.performance.totalValidations,
      averageValidationTime: Math.round(avgValidationTime * 1000) / 1000, // Round to 3 decimal places
      recentValidations: validationTimes.length
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Reset metrics (useful for testing)
 */
function resetMetrics() {
  metrics.staleDataPrevention = {
    totalAttempts: 0,
    preventedCount: 0,
    lastPrevented: null,
    averageAge: 0,
    maxAge: 0
  };
  metrics.performance = {
    validationTime: [],
    totalValidations: 0
  };
}

/**
 * Check if stale data prevention is working effectively
 * 
 * @returns {object} - Health check results
 */
function getHealthCheck() {
  const currentMetrics = getMetrics();
  const recentAttempts = metrics.staleDataPrevention.totalAttempts;
  const recentPrevented = metrics.staleDataPrevention.preventedCount;
  
  let status = 'healthy';
  let message = 'Stale data prevention is working normally';
  
  // Check for concerning patterns
  if (recentPrevented > 50) {
    status = 'warning';
    message = 'High number of stale data attempts detected - investigate potential issues';
  }
  
  if (currentMetrics.performance.averageValidationTime > 10) {
    status = 'warning';
    message = 'Validation performance is slower than expected';
  }
  
  return {
    status,
    message,
    metrics: currentMetrics
  };
}

module.exports = {
  recordStaleDataPrevention,
  recordValidationPerformance,
  getMetrics,
  resetMetrics,
  getHealthCheck
};