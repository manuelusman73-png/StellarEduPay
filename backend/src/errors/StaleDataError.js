'use strict';

/**
 * StaleDataError - Custom error for stale data prevention
 * 
 * Thrown when transaction data exceeds the configured freshness limit
 */
class StaleDataError extends Error {
  constructor(code, details = {}) {
    const message = details.message || 'Transaction data exceeds freshness limit';
    super(message);
    
    this.name = 'StaleDataError';
    this.code = code;
    this.details = details;
    this.status = 400;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StaleDataError);
    }
  }
}

module.exports = StaleDataError;