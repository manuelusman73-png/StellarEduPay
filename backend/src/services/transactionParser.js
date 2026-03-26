'use strict';

/**
 * Transaction Parser
 * 
 * Efficiently extracts and processes relevant data from incoming Stellar transactions.
 * Provides a clean API for memo extraction, amount parsing, and data validation.
 */

const { extractMemo } = require('./parsers/memoExtractor');
const { normalizeAmount, extractPaymentOperations } = require('./parsers/amountExtractor');
const logger = require('../utils/logger').child('TransactionParser');

// Parser version for metadata tracking
const PARSER_VERSION = '1.0.0';

/**
 * Custom error class for transaction parsing errors
 */
class TransactionParseError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TransactionParseError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Parse a complete Stellar transaction and extract relevant payment data
 * @param {object} tx - Stellar transaction object from Horizon API
 * @param {string} targetWallet - Expected destination wallet address
 * @returns {ParsedTransaction|null} Parsed data or null if invalid
 */
async function parseTransaction(tx, targetWallet) {
  const startTime = Date.now();
  
  try {
    // Validate basic transaction structure
    if (!tx || typeof tx !== 'object') {
      throw new TransactionParseError('INVALID_TRANSACTION', 'Transaction object is malformed or missing');
    }

    if (!tx.hash) {
      throw new TransactionParseError('INVALID_TRANSACTION', 'Transaction hash is missing');
    }

    // Check transaction success status
    if (tx.successful === false) {
      throw new TransactionParseError('TRANSACTION_FAILED', 'Transaction was not successful on the Stellar network');
    }

    // Extract memo
    const extractedMemo = extractMemo(tx);

    // Get operations and extract payment operations
    const ops = await tx.operations();
    const paymentOperations = extractPaymentOperations(ops.records, targetWallet);

    // Build parsed transaction result
    const parsedTransaction = {
      hash: tx.hash,
      successful: tx.successful,
      memo: extractedMemo.content,
      memoType: extractedMemo.type,
      operations: paymentOperations,
      ledger: tx.ledger_attr || tx.ledger || null,
      createdAt: tx.created_at,
      networkFee: parseFloat(tx.fee_paid || '0') / 10000000, // Convert stroops to XLM
      senderAddress: paymentOperations.length > 0 ? paymentOperations[0].from : null,
      metadata: {
        parserVersion: PARSER_VERSION,
        parsedAt: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime
      }
    };

    return parsedTransaction;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    if (error instanceof TransactionParseError) {
      logger.warn('Transaction parsing failed', {
        error: error.message,
        code: error.code,
        txHash: tx?.hash,
        processingTimeMs: processingTime
      });
      throw error;
    }

    // Handle unexpected errors
    logger.error('Unexpected error during transaction parsing', {
      error: error.message,
      stack: error.stack,
      txHash: tx?.hash,
      processingTimeMs: processingTime
    });
    
    throw new TransactionParseError('PARSING_ERROR', 'Unexpected error during parsing', { originalError: error.message });
  }
}

/**
 * Validate parsed transaction data against business rules
 * @param {ParsedTransaction} data - Parsed transaction data
 * @returns {ValidationResult} Validation result with errors if any
 */
function validateParsedData(data) {
  const errors = [];
  const warnings = [];

  // Validate required fields
  if (!data.hash) {
    errors.push({
      code: 'MISSING_HASH',
      message: 'Transaction hash is required',
      field: 'hash',
      value: data.hash
    });
  }

  if (!data.operations || data.operations.length === 0) {
    errors.push({
      code: 'NO_PAYMENT_OPERATIONS',
      message: 'No valid payment operations found',
      field: 'operations',
      value: data.operations
    });
  }

  // Validate memo format if present
  if (data.memo && typeof data.memo !== 'string') {
    errors.push({
      code: 'INVALID_MEMO_FORMAT',
      message: 'Memo must be a string',
      field: 'memo',
      value: data.memo
    });
  }

  // Validate amounts in operations
  if (data.operations) {
    data.operations.forEach((op, index) => {
      if (typeof op.amount !== 'number' || op.amount <= 0) {
        errors.push({
          code: 'INVALID_AMOUNT',
          message: `Invalid amount in operation ${index}`,
          field: `operations[${index}].amount`,
          value: op.amount
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

module.exports = {
  parseTransaction,
  validateParsedData,
  TransactionParseError
};