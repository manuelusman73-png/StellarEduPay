/**
 * Generate a Stellar SEP-0007 payment URI
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
 * 
 * @param {Object} params - Payment parameters
 * @param {string} params.destination - Stellar wallet address (G...)
 * @param {string|number} params.amount - Payment amount in XLM
 * @param {string} params.memo - Payment memo text
 * @param {string} [params.memoType='text'] - Memo type (text, id, hash, return)
 * @param {string} [params.assetCode='XLM'] - Asset code (XLM, USDC, etc.)
 * @param {string} [params.assetIssuer] - Asset issuer (required for non-native assets)
 * @returns {string} Stellar payment URI
 */
export function generateStellarPaymentUri({
  destination,
  amount,
  memo,
  memoType = 'text',
  assetCode = 'XLM',
  assetIssuer = null,
}) {
  if (!destination) {
    throw new Error('Destination wallet address is required');
  }
  
  if (!amount || parseFloat(amount) <= 0) {
    throw new Error('Valid payment amount is required');
  }

  const params = new URLSearchParams();
  params.append('destination', destination);
  params.append('amount', String(amount));
  
  if (memo) {
    params.append('memo', memo);
    params.append('memo_type', memoType.toUpperCase());
  }

  // For non-native assets, include asset code and issuer
  if (assetCode !== 'XLM' && assetCode !== 'native') {
    params.append('asset_code', assetCode);
    if (assetIssuer) {
      params.append('asset_issuer', assetIssuer);
    }
  }

  return `web+stellar:pay?${params.toString()}`;
}
