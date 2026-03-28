'use strict';

const StaleDataError = require('../errors/StaleDataError');
const logger = require('../utils/logger').child('StaleDataValidator');

// 30 minutes (1800 seconds) drift limit
const STALE_DATA_LIMIT_MS = parseInt(process.env.STALE_DATA_LIMIT_SECONDS, 10) * 1000 || 30 * 60 * 1000;

/**
 * Validates data freshness against strict time limits
 * Implements 1800-second (30-minute) drift limit
 * 
 * @param {string|Date} providedTimestamp - The timestamp to validate
 * @param {number|null} currentTimestamp - Current time (defaults to Date.now())
 * @returns {boolean} - Returns true if data is fresh
 * @throws {StaleDataError} - If data exceeds freshness limit
 */
function validateDataFreshness(providedTimestamp, currentTimestamp = null) {
  const now = currentTimestamp || Date.now();
  const providedTime = new Date(providedTimestamp).getTime();
  
  // Check if timestamp is valid
  if (isNaN(providedTime)) {
    throw new StaleDataError('ERR_INVALID_TIMESTAMP', {
      message: 'Invalid timestamp format',
      providedTimestamp,
      currentTimestamp: now
    });
  }
  
  const dataAge = now - providedTime;
  
  if (dataAge > STALE_DATA_LIMIT_MS) {
    const ageSeconds = Math.floor(dataAge / 1000);
    const limitSeconds = Math.floor(STALE_DATA_LIMIT_MS / 1000);
    
    logger.warn('Stale data detected', {
      providedTimestamp,
      currentTimestamp: now,
      ageSeconds,
      limitSeconds
    });
    
    throw new StaleDataError('ERR_STALE_DATA', {
      message: 'Transaction data exceeds 30-minute freshness limit',
      providedTimestamp,
      currentTimestamp: now,
      ageMs: dataAge,
      limitMs: STALE_DATA_LIMIT_MS,
      ageSeconds,
      limitSeconds
    });
  }
  
  return true;
}

/**
 * Validates Stellar transaction timestamp for freshness
 * 
 * @param {object} transaction - Stellar transaction object
 * @returns {boolean} - Returns true if transaction is fresh
 * @throws {StaleDataError} - If transaction data is stale
 */
function validateTransactionFreshness(transaction) {
  if (!transaction || !transaction.created_at) {
    throw new StaleDataError('ERR_MISSING_TIMESTAMP', {
      message: 'Transaction missing created_at timestamp',
      transaction: transaction ? transaction.hash : 'null'
    });
  }
  
  return validateDataFreshness(transaction.created_at);
}

/**
 * Validates Horizon API response timestamp for freshness
 * 
 * @param {object} response - Horizon API response
 * @returns {boolean} - Returns true if response is fresh
 * @throws {StaleDataError} - If response data is stale
 */
function validateHorizonResponseFreshness(response) {
  // Check for various timestamp fields in Horizon responses
  const timestamp = response.created_at || 
                   response.closed_at || 
                   response.timestamp ||
                   response.paging_token; // Some responses use paging_token for timing
  
  if (!timestamp) {
    logger.warn('Horizon response missing timestamp fields', {
      responseKeys: Object.keys(response)
    });
    // Don't throw error for missing timestamps in Horizon responses
    // as some endpoints may not include timing information
    return true;
  }
  
  return validateDataFreshness(timestamp);
}

/**
 * Get the current stale data limit configuration
 * 
 * @returns {object} - Configuration details
 */
function getStaleDataConfig() {
  return {
    limitMs: STALE_DATA_LIMIT_MS,
    limitSeconds: Math.floor(STALE_DATA_LIMIT_MS / 1000),
    limitMinutes: Math.floor(STALE_DATA_LIMIT_MS / (1000 * 60))
  };
}

module.exports = {
  validateDataFreshness,
  validateTransactionFreshness,
  validateHorizonResponseFreshness,
  getStaleDataConfig,
  STALE_DATA_LIMIT_MS
};