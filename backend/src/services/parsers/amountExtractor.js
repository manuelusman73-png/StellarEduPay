'use strict';

/**
 * Amount Extractor
 * 
 * Handles extraction and normalization of amounts from Stellar transaction operations.
 * Supports payment, path payment, and account merge operations.
 */

const { isAcceptedAsset } = require('../../config/stellarConfig');
const logger = require('../../utils/logger').child('AmountExtractor');

/**
 * Normalize Stellar amount to consistent decimal precision
 * @param {string} rawAmount - Raw amount from Stellar API
 * @returns {number} Normalized amount with 7 decimal precision
 */
function normalizeAmount(rawAmount) {
  if (!rawAmount) return 0;
  
  try {
    const parsed = parseFloat(rawAmount);
    if (isNaN(parsed)) {
      logger.warn('Invalid amount format', { rawAmount });
      return 0;
    }
    
    // Stellar uses 7 decimal places for precision
    return parseFloat(parsed.toFixed(7));
  } catch (error) {
    logger.error('Error normalizing amount', { rawAmount, error: error.message });
    return 0;
  }
}

/**
 * Extract payment amounts from transaction operations
 * @param {Array} operations - Transaction operations array
 * @param {string} targetWallet - Expected destination address
 * @returns {Array<PaymentOperation>} Array of relevant payment operations
 */
function extractPaymentOperations(operations, targetWallet) {
  if (!Array.isArray(operations)) {
    logger.warn('Operations is not an array', { operations });
    return [];
  }

  const paymentOps = [];

  for (const op of operations) {
    try {
      const paymentOp = extractSingleOperation(op, targetWallet);
      if (paymentOp) {
        paymentOps.push(paymentOp);
      }
    } catch (error) {
      logger.warn('Error processing operation', {
        operation: op,
        error: error.message
      });
      // Continue processing other operations
    }
  }

  return paymentOps;
}

/**
 * Extract payment data from a single operation
 * @param {object} op - Single Stellar operation
 * @param {string} targetWallet - Expected destination address
 * @returns {PaymentOperation|null} Payment operation data or null
 */
function extractSingleOperation(op, targetWallet) {
  if (!op || !op.type) {
    return null;
  }

  switch (op.type) {
    case 'payment':
      return extractPaymentOperation(op, targetWallet);
    
    case 'path_payment_strict_receive':
    case 'path_payment_strict_send':
      return extractPathPaymentOperation(op, targetWallet);
    
    case 'account_merge':
      return extractAccountMergeOperation(op, targetWallet);
    
    default:
      // Skip unsupported operation types
      return null;
  }
}

/**
 * Extract data from payment operation
 * @param {object} op - Payment operation
 * @param {string} targetWallet - Expected destination address
 * @returns {PaymentOperation|null} Payment operation data or null
 */
function extractPaymentOperation(op, targetWallet) {
  // Only process payments to the target wallet
  if (op.to !== targetWallet) {
    return null;
  }

  const asset = detectAsset(op);
  if (!asset) {
    return null;
  }

  const amount = normalizeAmount(op.amount);
  if (amount <= 0) {
    return null;
  }

  return {
    type: 'payment',
    amount: amount,
    asset: asset,
    from: op.from || null,
    to: op.to,
    sourceAmount: null,
    sourceAsset: null
  };
}

/**
 * Extract data from path payment operation
 * @param {object} op - Path payment operation
 * @param {string} targetWallet - Expected destination address
 * @returns {PaymentOperation|null} Path payment operation data or null
 */
function extractPathPaymentOperation(op, targetWallet) {
  // Only process path payments to the target wallet
  if (op.to !== targetWallet) {
    return null;
  }

  const destinationAsset = detectAsset(op);
  if (!destinationAsset) {
    return null;
  }

  const destinationAmount = normalizeAmount(op.amount);
  if (destinationAmount <= 0) {
    return null;
  }

  // Extract source amount and asset
  const sourceAmount = normalizeAmount(op.source_amount);
  const sourceAsset = detectSourceAsset(op);

  return {
    type: op.type,
    amount: destinationAmount,
    asset: destinationAsset,
    from: op.from || null,
    to: op.to,
    sourceAmount: sourceAmount > 0 ? sourceAmount : null,
    sourceAsset: sourceAsset
  };
}

/**
 * Extract data from account merge operation
 * @param {object} op - Account merge operation
 * @param {string} targetWallet - Expected destination address
 * @returns {PaymentOperation|null} Account merge operation data or null
 */
function extractAccountMergeOperation(op, targetWallet) {
  // Only process merges to the target wallet
  if (op.into !== targetWallet) {
    return null;
  }

  // Account merge always involves XLM (native asset)
  const asset = {
    code: 'XLM',
    type: 'native',
    issuer: null,
    displayName: 'Stellar Lumens',
    decimals: 7
  };

  // For account merge, we don't have the exact amount in the operation
  // This would need to be calculated from account balance at merge time
  return {
    type: 'account_merge',
    amount: 0, // Amount would need to be determined from account state
    asset: asset,
    from: op.account || null,
    to: op.into,
    sourceAmount: null,
    sourceAsset: null
  };
}

/**
 * Detect and validate asset information from payment operation
 * @param {object} op - Stellar operation
 * @returns {AssetInfo|null} Asset details or null if unsupported
 */
function detectAsset(op) {
  try {
    const assetType = op.asset_type;
    const assetCode = assetType === 'native' ? 'XLM' : op.asset_code;
    const assetIssuer = assetType === 'native' ? null : op.asset_issuer;

    // Check if asset is accepted by the system
    const { accepted, asset } = isAcceptedAsset(assetCode, assetType);
    if (!accepted) {
      logger.debug('Unsupported asset', { assetCode, assetType, assetIssuer });
      return null;
    }

    return {
      code: assetCode,
      type: assetType,
      issuer: assetIssuer,
      displayName: asset.displayName,
      decimals: asset.decimals
    };
  } catch (error) {
    logger.error('Error detecting asset', { operation: op, error: error.message });
    return null;
  }
}

/**
 * Detect source asset from path payment operation
 * @param {object} op - Path payment operation
 * @returns {AssetInfo|null} Source asset details or null
 */
function detectSourceAsset(op) {
  try {
    const sourceAssetType = op.source_asset_type;
    const sourceAssetCode = sourceAssetType === 'native' ? 'XLM' : op.source_asset_code;
    const sourceAssetIssuer = sourceAssetType === 'native' ? null : op.source_asset_issuer;

    const { accepted, asset } = isAcceptedAsset(sourceAssetCode, sourceAssetType);
    if (!accepted) {
      return null;
    }

    return {
      code: sourceAssetCode,
      type: sourceAssetType,
      issuer: sourceAssetIssuer,
      displayName: asset.displayName,
      decimals: asset.decimals
    };
  } catch (error) {
    logger.error('Error detecting source asset', { operation: op, error: error.message });
    return null;
  }
}

/**
 * Extract amounts from path payment operations
 * @param {object} pathPayOp - Path payment operation
 * @returns {PathPaymentAmounts} Source and destination amounts
 */
function extractPathPaymentAmounts(pathPayOp) {
  return {
    sourceAmount: normalizeAmount(pathPayOp.source_amount),
    destinationAmount: normalizeAmount(pathPayOp.amount),
    sourceAsset: detectSourceAsset(pathPayOp),
    destinationAsset: detectAsset(pathPayOp)
  };
}

module.exports = {
  normalizeAmount,
  extractPaymentOperations,
  extractPathPaymentAmounts,
  detectAsset
};