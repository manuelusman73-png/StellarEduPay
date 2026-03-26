'use strict';

const logger = require('./logger').child('HashValidator');

/**
 * Stellar transaction hash format:
 * - 64 characters long
 * - Hexadecimal (0-9, a-f, A-F)
 * - Case-insensitive but typically lowercase
 */
const STELLAR_HASH_REGEX = /^[0-9a-fA-F]{64}$/;

/**
 * Validate Stellar transaction hash format
 * @param {string} hash - Transaction hash to validate
 * @returns {object} { valid: boolean, error: string|null, normalized: string|null }
 */
function validateTransactionHash(hash) {
  // Check if hash exists
  if (!hash) {
    return {
      valid: false,
      error: 'Transaction hash is required',
      code: 'MISSING_HASH',
      normalized: null,
    };
  }

  // Check if hash is a string
  if (typeof hash !== 'string') {
    return {
      valid: false,
      error: 'Transaction hash must be a string',
      code: 'INVALID_HASH_TYPE',
      normalized: null,
    };
  }

  // Trim whitespace
  const trimmed = hash.trim();

  // Check length
  if (trimmed.length !== 64) {
    return {
      valid: false,
      error: `Transaction hash must be exactly 64 characters, got ${trimmed.length}`,
      code: 'INVALID_HASH_LENGTH',
      normalized: null,
    };
  }

  // Check format (hexadecimal)
  if (!STELLAR_HASH_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Transaction hash must contain only hexadecimal characters (0-9, a-f, A-F)',
      code: 'INVALID_HASH_FORMAT',
      normalized: null,
    };
  }

  // Normalize to lowercase for consistency
  const normalized = trimmed.toLowerCase();

  logger.debug('Transaction hash validated', { hash: normalized });

  return {
    valid: true,
    error: null,
    code: null,
    normalized,
  };
}

/**
 * Middleware to validate transaction hash in request parameters
 * @param {string} paramName - Name of the parameter containing the hash (default: 'txHash')
 */
function validateHashMiddleware(paramName = 'txHash') {
  return (req, res, next) => {
    const hash = req.params[paramName] || req.body[paramName] || req.query[paramName];
    
    const validation = validateTransactionHash(hash);
    
    if (!validation.valid) {
      const err = new Error(validation.error);
      err.code = validation.code;
      err.status = 400;
      return next(err);
    }

    // Store normalized hash back to the request
    if (req.params[paramName]) req.params[paramName] = validation.normalized;
    if (req.body[paramName]) req.body[paramName] = validation.normalized;
    if (req.query[paramName]) req.query[paramName] = validation.normalized;

    next();
  };
}

/**
 * Validate multiple transaction hashes
 * @param {array} hashes - Array of transaction hashes
 * @returns {object} { valid: boolean, errors: array, normalized: array }
 */
function validateTransactionHashes(hashes) {
  if (!Array.isArray(hashes)) {
    return {
      valid: false,
      errors: ['Input must be an array of transaction hashes'],
      normalized: [],
    };
  }

  const results = hashes.map((hash, index) => {
    const validation = validateTransactionHash(hash);
    return {
      index,
      hash,
      ...validation,
    };
  });

  const errors = results
    .filter(r => !r.valid)
    .map(r => `Hash at index ${r.index}: ${r.error}`);

  const normalized = results
    .filter(r => r.valid)
    .map(r => r.normalized);

  return {
    valid: errors.length === 0,
    errors,
    normalized,
  };
}

/**
 * Sanitize transaction hash for safe storage and comparison
 * @param {string} hash - Transaction hash
 * @returns {string|null} Sanitized hash or null if invalid
 */
function sanitizeHash(hash) {
  const validation = validateTransactionHash(hash);
  return validation.valid ? validation.normalized : null;
}

module.exports = {
  validateTransactionHash,
  validateHashMiddleware,
  validateTransactionHashes,
  sanitizeHash,
  STELLAR_HASH_REGEX,
};
