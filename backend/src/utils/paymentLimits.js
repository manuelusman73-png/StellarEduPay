'use strict';

const { MIN_PAYMENT_AMOUNT, MAX_PAYMENT_AMOUNT } = require('../config');

/**
 * Validate that a payment amount is within configured limits.
 * 
 * @param {number} amount - The payment amount to validate
 * @returns {Object} - { valid: boolean, error?: string, code?: string }
 */
function validatePaymentAmount(amount) {
  // Ensure amount is a valid number
  if (typeof amount !== 'number' || isNaN(amount)) {
    return {
      valid: false,
      error: 'Payment amount must be a valid number',
      code: 'INVALID_AMOUNT',
    };
  }

  // Check if amount is positive
  if (amount <= 0) {
    return {
      valid: false,
      error: 'Payment amount must be greater than zero',
      code: 'INVALID_AMOUNT',
    };
  }

  // Check minimum limit
  if (amount < MIN_PAYMENT_AMOUNT) {
    return {
      valid: false,
      error: `Payment amount ${amount} is below the minimum allowed amount of ${MIN_PAYMENT_AMOUNT}`,
      code: 'AMOUNT_TOO_LOW',
    };
  }

  // Check maximum limit
  if (amount > MAX_PAYMENT_AMOUNT) {
    return {
      valid: false,
      error: `Payment amount ${amount} exceeds the maximum allowed amount of ${MAX_PAYMENT_AMOUNT}`,
      code: 'AMOUNT_TOO_HIGH',
    };
  }

  return { valid: true };
}

/**
 * Get the current payment limits configuration.
 * 
 * @returns {Object} - { min: number, max: number }
 */
function getPaymentLimits() {
  return {
    min: MIN_PAYMENT_AMOUNT,
    max: MAX_PAYMENT_AMOUNT,
  };
}

module.exports = {
  validatePaymentAmount,
  getPaymentLimits,
};
