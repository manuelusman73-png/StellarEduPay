'use strict';

const StaleDataError = require('../errors/StaleDataError');
const logger = require('./logger').child('ResponseFormatter');

/**
 * Format successful API responses
 * 
 * @param {object} data - Response data
 * @param {string} message - Optional success message
 * @returns {object} - Formatted response
 */
function formatSuccess(data, message = null) {
  const response = {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };
  
  if (message) {
    response.message = message;
  }
  
  return response;
}

/**
 * Format error responses with consistent structure
 * 
 * @param {Error} error - Error object
 * @param {object} req - Express request object (optional)
 * @returns {object} - Formatted error response
 */
function formatError(error, req = null) {
  const response = {
    success: false,
    error: {
      message: error.message || 'An unexpected error occurred',
      code: error.code || 'INTERNAL_ERROR'
    },
    timestamp: new Date().toISOString()
  };
  
  // Handle stale data errors specifically
  if (error instanceof StaleDataError) {
    response.error.code = error.code;
    response.error.details = error.details;
    
    // Log stale data attempts for security monitoring
    logger.warn('Stale data error formatted for response', {
      code: error.code,
      details: error.details,
      userAgent: req ? req.get('User-Agent') : null,
      ip: req ? req.ip : null
    });
  }
  
  // Include additional error details if available
  if (error.details) {
    response.error.details = error.details;
  }
  
  return response;
}

/**
 * Format stale data error responses with specific structure
 * 
 * @param {StaleDataError} error - Stale data error
 * @returns {object} - Formatted stale data error response
 */
function formatStaleDataError(error) {
  return {
    success: false,
    error: {
      message: 'Transaction data exceeds freshness limit',
      code: 'ERR_STALE_DATA',
      details: {
        providedTimestamp: error.details.providedTimestamp,
        currentTimestamp: error.details.currentTimestamp,
        ageSeconds: error.details.ageSeconds,
        limitSeconds: error.details.limitSeconds
      }
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Express middleware for handling stale data errors
 * 
 * @param {Error} err - Error object
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware function
 */
function handleStaleDataError(err, req, res, next) {
  if (err instanceof StaleDataError) {
    const formattedError = formatStaleDataError(err);
    return res.status(400).json(formattedError);
  }
  
  // Pass to next error handler if not a stale data error
  next(err);
}

/**
 * General error handler middleware
 * 
 * @param {Error} err - Error object
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware function
 */
function handleError(err, req, res, next) {
  // Handle stale data errors first
  if (err instanceof StaleDataError) {
    return handleStaleDataError(err, req, res, next);
  }
  
  // Determine status code
  const statusCode = err.status || err.statusCode || 500;
  
  // Format error response
  const formattedError = formatError(err, req);
  
  // Log error for monitoring
  logger.error('Error handled by response formatter', {
    error: err.message,
    code: err.code,
    statusCode,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  
  res.status(statusCode).json(formattedError);
}

module.exports = {
  formatSuccess,
  formatError,
  formatStaleDataError,
  handleStaleDataError,
  handleError
};