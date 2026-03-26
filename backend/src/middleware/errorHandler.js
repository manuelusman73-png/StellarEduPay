'use strict';

const logger = require('../utils/logger').child('ErrorHandler');

/**
 * Standard API response format
 */
function successResponse(data, message = null, meta = {}) {
  const response = {
    success: true,
    data,
  };
  
  if (message) {
    response.message = message;
  }
  
  if (Object.keys(meta).length > 0) {
    response.meta = meta;
  }
  
  return response;
}

/**
 * Standard error response format
 */
function errorResponse(message, code = 'INTERNAL_ERROR', details = null) {
  const response = {
    success: false,
    error: {
      message,
      code,
    },
  };
  
  if (details) {
    response.error.details = details;
  }
  
  return response;
}

/**
 * Map error codes to HTTP status codes
 */
const ERROR_STATUS_MAP = {
  // 400 - Bad Request
  TX_FAILED: 400,
  MISSING_MEMO: 400,
  INVALID_DESTINATION: 400,
  UNSUPPORTED_ASSET: 400,
  VALIDATION_ERROR: 400,
  UNDERPAID: 400,
  MISSING_SCHOOL_CONTEXT: 400,
  MISSING_IDEMPOTENCY_KEY: 400,
  INVALID_AMOUNT: 400,
  AMOUNT_TOO_LOW: 400,
  AMOUNT_TOO_HIGH: 400,
  INVALID_HASH_FORMAT: 400,
  
  // 404 - Not Found
  NOT_FOUND: 404,
  SCHOOL_NOT_FOUND: 404,
  STUDENT_NOT_FOUND: 404,
  PAYMENT_NOT_FOUND: 404,
  
  // 409 - Conflict
  DUPLICATE_TX: 409,
  DUPLICATE_SCHOOL: 409,
  DUPLICATE_STUDENT: 409,
  DUPLICATE_IDEMPOTENCY_KEY: 409,
  
  // 502 - Bad Gateway
  STELLAR_NETWORK_ERROR: 502,
  HORIZON_ERROR: 502,
  
  // 503 - Service Unavailable
  REQUEST_TIMEOUT: 503,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Global error handler middleware
 */
function globalErrorHandler(err, req, res, next) {
  // Determine status code
  const statusCode = ERROR_STATUS_MAP[err.code] || err.status || err.statusCode || 500;
  
  // Log error with context
  const logContext = {
    code: err.code || 'INTERNAL_ERROR',
    message: err.message,
    status: statusCode,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
    schoolId: req.schoolId,
  };
  
  if (statusCode >= 500) {
    logger.error('Server error', { ...logContext, stack: err.stack });
  } else if (statusCode >= 400) {
    logger.warn('Client error', logContext);
  }
  
  // Send standardized error response
  res.status(statusCode).json(
    errorResponse(
      err.message,
      err.code || 'INTERNAL_ERROR',
      err.details || null
    )
  );
}

/**
 * 404 handler for undefined routes
 */
function notFoundHandler(req, res) {
  res.status(404).json(
    errorResponse(
      `Route ${req.method} ${req.path} not found`,
      'ROUTE_NOT_FOUND'
    )
  );
}

/**
 * Async route wrapper to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  successResponse,
  errorResponse,
  globalErrorHandler,
  notFoundHandler,
  asyncHandler,
};
