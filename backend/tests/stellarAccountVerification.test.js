'use strict';

/**
 * Unit tests for Stellar account funding verification.
 * Tests the verifyStellarAccountFunding service for funded, unfunded, and network error scenarios.
 */

const { verifyStellarAccountFunding } = require('../src/services/stellarAccountVerificationService');

// Mock the Stellar SDK Horizon server
jest.mock('../src/config/stellarConfig', () => ({
  server: {
    accounts: jest.fn(),
  },
}));

const { server } = require('../src/config/stellarConfig');

describe('stellarAccountVerificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyStellarAccountFunding', () => {
    const validAddress = 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJJVP2FPYY3D3BTYWP2XMWRIN';

    it('should return isFunded: true for a funded account', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          balances: [
            { asset_type: 'native', balance: '5.0000000' },
          ],
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: true, warning: null });
      expect(mockAccountId).toHaveBeenCalledWith(validAddress);
    });

    it('should return isFunded: true for an account with exactly 1 XLM', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          balances: [
            { asset_type: 'native', balance: '1.0000000' },
          ],
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: true, warning: null });
    });

    it('should return warning: STELLAR_ACCOUNT_UNFUNDED for an account with less than 1 XLM', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          balances: [
            { asset_type: 'native', balance: '0.5000000' },
          ],
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: false, warning: 'STELLAR_ACCOUNT_UNFUNDED' });
    });

    it('should return warning: STELLAR_ACCOUNT_UNFUNDED for an account with 0 XLM', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          balances: [
            { asset_type: 'native', balance: '0.0000000' },
          ],
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: false, warning: 'STELLAR_ACCOUNT_UNFUNDED' });
    });

    it('should return warning: STELLAR_ACCOUNT_UNFUNDED for an account with no native balance', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          balances: [
            { asset_type: 'credit_alphanum4', code: 'USDC', balance: '100.0000000' },
          ],
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: false, warning: 'STELLAR_ACCOUNT_UNFUNDED' });
    });

    it('should return warning: STELLAR_ACCOUNT_UNFUNDED for a 404 (account not found)', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockRejectedValue({
          response: { status: 404 },
          message: 'Account not found',
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: false, warning: 'STELLAR_ACCOUNT_UNFUNDED' });
    });

    it('should return isFunded: null, warning: null on Horizon timeout', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockImplementation(
          () => new Promise((resolve) => {
            // Simulate a timeout by never resolving
            setTimeout(() => resolve({}), 5000);
          })
        ),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: null, warning: null });
    }, 5000);

    it('should return isFunded: null, warning: null on network error (ECONNREFUSED)', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockRejectedValue({
          code: 'ECONNREFUSED',
          message: 'Connection refused',
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: null, warning: null });
    });

    it('should return isFunded: null, warning: null on network error (ETIMEDOUT)', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockRejectedValue({
          code: 'ETIMEDOUT',
          message: 'Connection timed out',
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: null, warning: null });
    });

    it('should return isFunded: null, warning: null on Horizon 5xx error', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockRejectedValue({
          response: { status: 503 },
          message: 'Service unavailable',
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: null, warning: null });
    });

    it('should return isFunded: null, warning: null on rate limit (429)', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockRejectedValue({
          response: { status: 429 },
          message: 'Too many requests',
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: null, warning: null });
    });

    it('should handle account with multiple balances including native', async () => {
      const mockAccountId = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({
          balances: [
            { asset_type: 'credit_alphanum4', code: 'USDC', balance: '100.0000000' },
            { asset_type: 'native', balance: '2.5000000' },
            { asset_type: 'credit_alphanum12', code: 'EURT', balance: '50.0000000' },
          ],
        }),
      });

      server.accounts.mockReturnValue({ accountId: mockAccountId });

      const result = await verifyStellarAccountFunding(validAddress);

      expect(result).toEqual({ isFunded: true, warning: null });
    });
  });
});
