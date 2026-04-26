/**
 * Tests for currency conversion service
 */

import { fetchXlmPrice, convertXlmToUsd, getCacheStatus } from '../currencyService';

// Mock fetch globally
global.fetch = jest.fn();

describe('Currency Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset cache by advancing time
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('fetchXlmPrice', () => {
    it('should fetch and cache XLM price', async () => {
      const mockPrice = 0.12345;
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stellar: { usd: mockPrice } })
      });

      const price = await fetchXlmPrice();
      expect(price).toBe(mockPrice);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should return cached price within 5 minutes', async () => {
      const mockPrice = 0.12345;
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stellar: { usd: mockPrice } })
      });

      // First call
      await fetchXlmPrice();
      
      // Advance time by 2 minutes
      jest.advanceTimersByTime(2 * 60 * 1000);
      
      // Second call should use cache
      const price = await fetchXlmPrice();
      expect(price).toBe(mockPrice);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('should refetch after cache expires', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ stellar: { usd: 0.12 } })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ stellar: { usd: 0.15 } })
        });

      await fetchXlmPrice();
      
      // Advance time by 6 minutes (past cache duration)
      jest.advanceTimersByTime(6 * 60 * 1000);
      
      const price = await fetchXlmPrice();
      expect(price).toBe(0.15);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should return stale cache on fetch error', async () => {
      const mockPrice = 0.12345;
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ stellar: { usd: mockPrice } })
        })
        .mockRejectedValueOnce(new Error('Network error'));

      // First successful call
      await fetchXlmPrice();
      
      // Advance time past cache expiry
      jest.advanceTimersByTime(6 * 60 * 1000);
      
      // Should return stale cache on error
      const price = await fetchXlmPrice();
      expect(price).toBe(mockPrice);
    });

    it('should return null if no cache and fetch fails', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const price = await fetchXlmPrice();
      expect(price).toBeNull();
    });
  });

  describe('convertXlmToUsd', () => {
    it('should convert XLM amount to USD', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stellar: { usd: 0.25 } })
      });

      const result = await convertXlmToUsd(100);
      expect(result.usd).toBe(25.00);
      expect(result.rate).toBe(0.25);
    });

    it('should return null values when price unavailable', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await convertXlmToUsd(100);
      expect(result.usd).toBeNull();
      expect(result.rate).toBeNull();
    });
  });
});
