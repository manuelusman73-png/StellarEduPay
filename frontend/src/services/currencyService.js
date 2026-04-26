/**
 * Currency conversion service for fetching XLM/USD rates
 * Uses CoinGecko public API with 5-minute client-side caching
 */

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let priceCache = null;
let lastFetchTime = null;

/**
 * Fetch current XLM/USD price from CoinGecko API
 * @returns {Promise<number|null>} XLM price in USD, or null if unavailable
 */
export async function fetchXlmPrice() {
  // Return cached price if still valid
  if (priceCache !== null && lastFetchTime && Date.now() - lastFetchTime < CACHE_DURATION) {
    return priceCache;
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd',
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    
    if (!response.ok) {
      console.warn('Failed to fetch XLM price:', response.status);
      return priceCache; // Return stale cache if available
    }

    const data = await response.json();
    const price = data?.stellar?.usd;

    if (typeof price === 'number' && price > 0) {
      priceCache = price;
      lastFetchTime = Date.now();
      return price;
    }

    console.warn('Invalid price data from CoinGecko');
    return priceCache; // Return stale cache if available
  } catch (error) {
    console.error('Error fetching XLM price:', error);
    return priceCache; // Return stale cache if available
  }
}

/**
 * Convert XLM amount to USD
 * @param {number} xlmAmount - Amount in XLM
 * @returns {Promise<{usd: number|null, rate: number|null, cached: boolean}>}
 */
export async function convertXlmToUsd(xlmAmount) {
  const wasCached = priceCache !== null && lastFetchTime && Date.now() - lastFetchTime < CACHE_DURATION;
  const rate = await fetchXlmPrice();
  
  if (rate === null) {
    return { usd: null, rate: null, cached: false };
  }

  const isCached = wasCached || (lastFetchTime && Date.now() - lastFetchTime < CACHE_DURATION);
  
  return {
    usd: parseFloat((xlmAmount * rate).toFixed(2)),
    rate,
    cached: isCached
  };
}

/**
 * Get cache status for debugging
 * @returns {{price: number|null, age: number|null, valid: boolean}}
 */
export function getCacheStatus() {
  if (!lastFetchTime) {
    return { price: null, age: null, valid: false };
  }

  const age = Date.now() - lastFetchTime;
  return {
    price: priceCache,
    age,
    valid: age < CACHE_DURATION
  };
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache() {
  priceCache = null;
  lastFetchTime = null;
}
