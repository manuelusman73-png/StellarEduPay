'use strict';

/**
 * Response helper utilities for consistent API responses
 */

/**
 * Send a standardized success response
 * @param {object} res - Express response object
 * @param {any} data - Response data
 * @param {string} message - Optional success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {object} meta - Optional metadata (pagination, etc.)
 */
function sendSuccess(res, data, message = null, statusCode = 200, meta = {}) {
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
  
  return res.status(statusCode).json(response);
}

/**
 * Send a standardized error response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {any} details - Optional error details
 */
function sendError(res, message, code = 'INTERNAL_ERROR', statusCode = 500, details = null) {
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
  
  return res.status(statusCode).json(response);
}

/**
 * Send a paginated response
 * @param {object} res - Express response object
 * @param {array} data - Array of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 */
function sendPaginated(res, data, page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  
  return sendSuccess(res, data, null, 200, {
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
}

module.exports = {
  sendSuccess,
  sendError,
  sendPaginated,
};
