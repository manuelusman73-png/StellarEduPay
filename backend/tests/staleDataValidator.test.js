'use strict';

const { 
  validateDataFreshness, 
  validateTransactionFreshness,
  validateHorizonResponseFreshness,
  getStaleDataConfig,
  STALE_DATA_LIMIT_MS 
} = require('../src/services/staleDataValidator');
const StaleDataError = require('../src/errors/StaleDataError');

describe('Stale Data Prevention', () => {
  const LIMIT_SECONDS = 1800; // 30 minutes
  const LIMIT_MS = LIMIT_SECONDS * 1000;

  describe('validateDataFreshness', () => {
    test('accepts data within 1800 second limit', () => {
      const freshTimestamp = new Date(Date.now() - 1799000); // 1799 seconds ago
      
      expect(() => validateDataFreshness(freshTimestamp))
        .not.toThrow();
    });

    test('rejects data older than 1800 seconds', () => {
      const staleTimestamp = new Date(Date.now() - 1801000); // 1801 seconds ago
      
      expect(() => validateDataFreshness(staleTimestamp))
        .toThrow(StaleDataError);
    });

    test('handles edge case at exact 1800 second boundary', () => {
      const boundaryTimestamp = new Date(Date.now() - 1800000); // Exactly 1800 seconds
      
      expect(() => validateDataFreshness(boundaryTimestamp))
        .not.toThrow();
    });

    test('throws StaleDataError with correct details for stale data', () => {
      const staleTimestamp = new Date(Date.now() - 3600000); // 1 hour ago
      const currentTime = Date.now();
      
      try {
        validateDataFreshness(staleTimestamp, currentTime);
        fail('Expected StaleDataError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StaleDataError);
        expect(error.code).toBe('ERR_STALE_DATA');
        expect(error.details.ageSeconds).toBe(3600);
        expect(error.details.limitSeconds).toBe(1800);
        expect(error.details.providedTimestamp).toEqual(staleTimestamp);
        expect(error.details.currentTimestamp).toBe(currentTime);
      }
    });

    test('handles string timestamps correctly', () => {
      const freshTimestamp = new Date(Date.now() - 1000000).toISOString(); // 16.67 minutes ago
      
      expect(() => validateDataFreshness(freshTimestamp))
        .not.toThrow();
    });

    test('throws error for invalid timestamp format', () => {
      expect(() => validateDataFreshness('invalid-timestamp'))
        .toThrow(StaleDataError);
      
      expect(() => validateDataFreshness(null))
        .toThrow(StaleDataError);
      
      expect(() => validateDataFreshness(undefined))
        .toThrow(StaleDataError);
    });

    test('uses current time when currentTimestamp not provided', () => {
      const recentTimestamp = new Date(Date.now() - 60000); // 1 minute ago
      
      expect(() => validateDataFreshness(recentTimestamp))
        .not.toThrow();
    });
  });

  describe('validateTransactionFreshness', () => {
    test('validates fresh Stellar transaction', () => {
      const transaction = {
        hash: 'abc123',
        created_at: new Date(Date.now() - 600000).toISOString() // 10 minutes ago
      };
      
      expect(() => validateTransactionFreshness(transaction))
        .not.toThrow();
    });

    test('rejects stale Stellar transaction', () => {
      const transaction = {
        hash: 'def456',
        created_at: new Date(Date.now() - 2400000).toISOString() // 40 minutes ago
      };
      
      expect(() => validateTransactionFreshness(transaction))
        .toThrow(StaleDataError);
    });

    test('throws error for transaction without created_at', () => {
      const transaction = { hash: 'ghi789' };
      
      expect(() => validateTransactionFreshness(transaction))
        .toThrow(StaleDataError);
    });

    test('throws error for null transaction', () => {
      expect(() => validateTransactionFreshness(null))
        .toThrow(StaleDataError);
    });
  });

  describe('validateHorizonResponseFreshness', () => {
    test('validates fresh Horizon response with created_at', () => {
      const response = {
        created_at: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
        hash: 'horizon123'
      };
      
      expect(() => validateHorizonResponseFreshness(response))
        .not.toThrow();
    });

    test('validates fresh Horizon response with closed_at', () => {
      const response = {
        closed_at: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
        sequence: 12345
      };
      
      expect(() => validateHorizonResponseFreshness(response))
        .not.toThrow();
    });

    test('rejects stale Horizon response', () => {
      const response = {
        created_at: new Date(Date.now() - 2700000).toISOString(), // 45 minutes ago
        hash: 'stale456'
      };
      
      expect(() => validateHorizonResponseFreshness(response))
        .toThrow(StaleDataError);
    });

    test('accepts response without timestamp (does not throw)', () => {
      const response = {
        hash: 'notimestamp789',
        amount: '100.0000000'
      };
      
      expect(() => validateHorizonResponseFreshness(response))
        .not.toThrow();
    });
  });

  describe('getStaleDataConfig', () => {
    test('returns correct configuration', () => {
      const config = getStaleDataConfig();
      
      expect(config.limitMs).toBe(LIMIT_MS);
      expect(config.limitSeconds).toBe(LIMIT_SECONDS);
      expect(config.limitMinutes).toBe(30);
    });
  });

  describe('Property-based testing', () => {
    test('validates random timestamps within limit', () => {
      for (let i = 0; i < 100; i++) {
        // Generate random timestamp within the last 29 minutes
        const randomAge = Math.floor(Math.random() * (29 * 60 * 1000)); // 0 to 29 minutes
        const timestamp = new Date(Date.now() - randomAge);
        
        expect(() => validateDataFreshness(timestamp))
          .not.toThrow();
      }
    });

    test('rejects random timestamps beyond limit', () => {
      for (let i = 0; i < 100; i++) {
        // Generate random timestamp beyond 31 minutes ago
        const randomAge = (31 * 60 * 1000) + Math.floor(Math.random() * (60 * 60 * 1000)); // 31 minutes to 91 minutes
        const timestamp = new Date(Date.now() - randomAge);
        
        expect(() => validateDataFreshness(timestamp))
          .toThrow(StaleDataError);
      }
    });
  });

  describe('Boundary testing', () => {
    test('validates timestamps at various boundaries', () => {
      const testCases = [
        { age: 0, shouldPass: true, description: 'current time' },
        { age: 1000, shouldPass: true, description: '1 second ago' },
        { age: 60000, shouldPass: true, description: '1 minute ago' },
        { age: 900000, shouldPass: true, description: '15 minutes ago' },
        { age: 1799000, shouldPass: true, description: '29.98 minutes ago' },
        { age: 1800000, shouldPass: true, description: 'exactly 30 minutes ago' },
        { age: 1801000, shouldPass: false, description: '30.02 minutes ago' },
        { age: 3600000, shouldPass: false, description: '1 hour ago' },
      ];

      testCases.forEach(({ age, shouldPass, description }) => {
        const timestamp = new Date(Date.now() - age);
        
        if (shouldPass) {
          expect(() => validateDataFreshness(timestamp))
            .not.toThrow(`Should pass for ${description}`);
        } else {
          expect(() => validateDataFreshness(timestamp))
            .toThrow(StaleDataError);
        }
      });
    });
  });

  describe('Error handling', () => {
    test('StaleDataError contains all required fields', () => {
      const staleTimestamp = new Date(Date.now() - 3600000);
      const currentTime = Date.now();
      
      try {
        validateDataFreshness(staleTimestamp, currentTime);
      } catch (error) {
        expect(error.name).toBe('StaleDataError');
        expect(error.code).toBe('ERR_STALE_DATA');
        expect(error.status).toBe(400);
        expect(error.details).toHaveProperty('providedTimestamp');
        expect(error.details).toHaveProperty('currentTimestamp');
        expect(error.details).toHaveProperty('ageMs');
        expect(error.details).toHaveProperty('limitMs');
        expect(error.details).toHaveProperty('ageSeconds');
        expect(error.details).toHaveProperty('limitSeconds');
      }
    });
  });

  describe('Performance testing', () => {
    test('validation completes within acceptable time', () => {
      const timestamp = new Date(Date.now() - 600000); // 10 minutes ago
      const iterations = 1000;
      
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        validateDataFreshness(timestamp);
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      
      // Should complete 1000 validations in under 100ms
      expect(durationMs).toBeLessThan(100);
    });
  });
});