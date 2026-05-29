'use strict';

// Tests the real stellarConfig module (not mocked) to verify startup validation.
// Each test isolates the module by resetting the registry between cases.

const VALID_KEY = 'GB4KTCLQQHLW7CRJVVGOES2ZI2SX7T4ZEJRDCMPL5HRVRSDHZK3M4WVA';

function loadConfig(walletAddress) {
  jest.resetModules();
  process.env.MONGO_URI = 'mongodb://localhost:27017/test';
  process.env.STELLAR_NETWORK = 'testnet';
  if (walletAddress === undefined) {
    delete process.env.SCHOOL_WALLET_ADDRESS;
  } else {
    process.env.SCHOOL_WALLET_ADDRESS = walletAddress;
  }
  return () => require('../backend/src/config/stellarConfig');
}

describe('stellarConfig startup validation', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@stellar/stellar-sdk');
    delete process.env.STELLAR_HORIZON_URL;
    delete process.env.HORIZON_URL;
  });

  test('throws if SCHOOL_WALLET_ADDRESS is missing', () => {
    expect(loadConfig(undefined)).toThrow(/missing/i);
  });

  test('throws if SCHOOL_WALLET_ADDRESS is an invalid key', () => {
    expect(loadConfig('INVALID_KEY')).toThrow(/invalid/i);
  });

  test('throws if SCHOOL_WALLET_ADDRESS is empty string', () => {
    expect(loadConfig('')).toThrow(/missing/i);
  });

  test('loads successfully with a valid Stellar public key', () => {
    expect(loadConfig(VALID_KEY)).not.toThrow();
    const cfg = require('../backend/src/config/stellarConfig');
    expect(cfg.SCHOOL_WALLET).toBe(VALID_KEY);
  });

  test('uses STELLAR_HORIZON_URL to construct the Horizon server', () => {
    jest.resetModules();
    process.env.MONGO_URI = 'mongodb://localhost:27017/test';
    process.env.SCHOOL_WALLET_ADDRESS = VALID_KEY;
    process.env.STELLAR_HORIZON_URL = 'https://horizon-testnet.stellar.org';

    const mockServerCtor = jest.fn(() => ({ serverURL: 'https://horizon-testnet.stellar.org' }));
    jest.doMock('@stellar/stellar-sdk', () => ({
      Horizon: {
        Server: mockServerCtor,
      },
      Networks: {
        TESTNET: 'Test SDF Network ; September 2015',
        PUBLIC: 'Public Global Stellar Network ; September 2015',
      },
      StrKey: {
        isValidEd25519PublicKey: jest.fn(() => true),
      },
    }));

    expect(() => require('../backend/src/config/stellarConfig')).not.toThrow();
    expect(mockServerCtor).toHaveBeenCalledWith(
      'https://horizon-testnet.stellar.org',
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });
});
