import { useState, useEffect } from 'react';
import { convertXlmToUsd } from '../services/currencyService';

/**
 * Custom hook for XLM to USD conversion with automatic caching
 * @param {number|null} xlmAmount - Amount in XLM to convert
 * @returns {{usd: number|null, rate: number|null, loading: boolean}}
 */
export function useFiatConversion(xlmAmount) {
  const [conversion, setConversion] = useState({ usd: null, rate: null, loading: true });

  useEffect(() => {
    if (!xlmAmount || xlmAmount <= 0) {
      setConversion({ usd: null, rate: null, loading: false });
      return;
    }

    let cancelled = false;

    async function fetchConversion() {
      const result = await convertXlmToUsd(xlmAmount);
      if (!cancelled) {
        setConversion({ ...result, loading: false });
      }
    }

    fetchConversion();

    return () => {
      cancelled = true;
    };
  }, [xlmAmount]);

  return conversion;
}
