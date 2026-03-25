'use strict';

// Must set required env vars before any module that loads config/index.js
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GTEST123';

const {
  verifyTransaction,
  syncPaymentsForSchool,
  validatePaymentAgainstFee,
  detectAsset,
  normalizeAmount,
  extractValidPayment,
} = require('../backend/src/services/stellarService');

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockOperations = jest.fn();

jest.mock('../backend/src/config/stellarConfig', () => ({
  SCHOOL_WALLET: 'GTEST123',
  CONFIRMATION_THRESHOLD: 2,
  ACCEPTED_ASSETS: {
    XLM:  { code: 'XLM',  type: 'native',          issuer: null },
    USDC: { code: 'USDC', type: 'credit_alphanum4', issuer: 'GISSUER' },
  },
  isAcceptedAsset: (code, type) => {
    const map = { XLM: 'native', USDC: 'credit_alphanum4' };
    if (map[code] && map[code] === type) return { accepted: true, asset: { code, type } };
    return { accepted: false, asset: null };
  },
  server: {
    transactions: () => ({
      forAccount: () => ({
        order: () => ({ limit: () => ({ call: async () => ({ records: [] }) }) }),
      }),
      transaction: (txHash) => ({
        call: async () => ({
          hash: txHash,
          memo: 'STU001',
          successful: true,
          created_at: new Date().toISOString(),
          operations: mockOperations,
        }),
      }),
    }),
    ledgers: () => ({
      order: () => ({ limit: () => ({ call: async () => ({ records: [{ sequence: 100 }] }) }) }),
    }),
  },
}));

jest.mock('../backend/src/models/paymentModel', () => ({
  findOne: jest.fn(),
  create: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/paymentIntentModel', () => ({
  findOne: jest.fn().mockResolvedValue({ _id: 'intent123', studentId: 'STU001', amount: 200, memo: 'STU001', status: 'pending' }),
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/studentModel', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));

const Payment = require('../backend/src/models/paymentModel');
const Student = require('../backend/src/models/studentModel');

// ─── validatePaymentAgainstFee ────────────────────────────────────────────────

describe('validatePaymentAgainstFee', () => {
  test('valid when payment equals fee', () => {
    expect(validatePaymentAgainstFee(200, 200).status).toBe('valid');
  });

  test('underpaid when payment is less than fee', () => {
    expect(validatePaymentAgainstFee(150, 200).status).toBe('underpaid');
  });

  test('overpaid when payment exceeds fee', () => {
    expect(validatePaymentAgainstFee(250, 200).status).toBe('overpaid');
  });

  test('messages include the amounts', () => {
    expect(validatePaymentAgainstFee(50, 200).message).toContain('50');
    expect(validatePaymentAgainstFee(50, 200).message).toContain('200');
  });
});

// ─── detectAsset ─────────────────────────────────────────────────────────────

describe('detectAsset', () => {
  test('recognizes native XLM', () => {
    expect(detectAsset({ asset_type: 'native' })).toEqual({
      assetCode: 'XLM',
      assetType: 'native',
      assetIssuer: null,
    });
  });

  test('recognizes USDC', () => {
    expect(detectAsset({ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUER' })).toEqual({
      assetCode: 'USDC',
      assetType: 'credit_alphanum4',
      assetIssuer: 'GISSUER',
    });
  });

  test('returns null for unsupported asset', () => {
    expect(detectAsset({ asset_type: 'credit_alphanum4', asset_code: 'SHIB', asset_issuer: 'GRANDOM' })).toBeNull();
  });

  test('returns null when asset type does not match', () => {
    // XLM code but wrong type
    expect(detectAsset({ asset_type: 'credit_alphanum4', asset_code: 'XLM', asset_issuer: 'GISSUER' })).toBeNull();
  });
});

// ─── normalizeAmount ──────────────────────────────────────────────────────────

describe('normalizeAmount', () => {
  test('rounds to 7 decimal places', () => {
    expect(normalizeAmount('100.123456789')).toBe(100.1234568);
  });

  test('handles whole numbers', () => {
    expect(normalizeAmount('200')).toBe(200.0);
  });

  test('handles smallest XLM unit', () => {
    expect(normalizeAmount('0.0000001')).toBe(0.0000001);
  });
});

// ─── extractValidPayment ──────────────────────────────────────────────────────

describe('extractValidPayment', () => {
  const validOps = async () => ({
    records: [{ type: 'payment', to: 'GTEST123', amount: '100.0', asset_type: 'native' }],
  });

  test('returns payOp, memo, asset for a valid transaction', async () => {
    const tx = { successful: true, memo: 'STU001', operations: validOps };
    const result = await extractValidPayment(tx, 'GTEST123');
    expect(result).not.toBeNull();
    expect(result.memo).toBe('STU001');
    expect(result.asset.assetCode).toBe('XLM');
  });

  test('returns null for a failed transaction', async () => {
    const tx = { successful: false, memo: 'STU001', operations: validOps };
    expect(await extractValidPayment(tx, 'GTEST123')).toBeNull();
  });

  test('returns null when memo is missing', async () => {
    const tx = { successful: true, memo: undefined, operations: validOps };
    expect(await extractValidPayment(tx, 'GTEST123')).toBeNull();
  });

  test('returns null when memo is empty string', async () => {
    const tx = { successful: true, memo: '   ', operations: validOps };
    expect(await extractValidPayment(tx, 'GTEST123')).toBeNull();
  });

  test('returns null when no payment op to school wallet', async () => {
    const tx = {
      successful: true,
      memo: 'STU001',
      operations: async () => ({ records: [{ type: 'payment', to: 'GOTHER', amount: '100.0', asset_type: 'native' }] }),
    };
    expect(await extractValidPayment(tx, 'GTEST123')).toBeNull();
  });

  test('returns null for unsupported asset', async () => {
    const tx = {
      successful: true,
      memo: 'STU001',
      operations: async () => ({
        records: [{ type: 'payment', to: 'GTEST123', amount: '100.0', asset_type: 'credit_alphanum4', asset_code: 'SHIB', asset_issuer: 'GRANDOM' }],
      }),
    };
    expect(await extractValidPayment(tx, 'GTEST123')).toBeNull();
  });
});

// ─── verifyTransaction ────────────────────────────────────────────────────────

describe('verifyTransaction', () => {
  beforeEach(() => {
    Student.findOne.mockResolvedValue({ studentId: 'STU001', feeAmount: 100 });
  });

  test('returns payment details with asset info for a valid XLM transaction', async () => {
    mockOperations.mockResolvedValue({
      records: [{ type: 'payment', to: 'GTEST123', amount: '100.0', asset_type: 'native' }],
    });
    const result = await verifyTransaction('abc123', 'GTEST123');
    expect(result).toMatchObject({ hash: 'abc123', memo: 'STU001', amount: 100, assetCode: 'XLM', assetType: 'native' });
    expect(result.feeValidation.status).toBe('valid');
  });

  test('throws INVALID_DESTINATION when no matching payment op', async () => {
    mockOperations.mockResolvedValue({ records: [] });
    await expect(verifyTransaction('abc123', 'GTEST123')).rejects.toMatchObject({ code: 'INVALID_DESTINATION' });
  });

  test('throws INVALID_DESTINATION when payment is to a different wallet', async () => {
    mockOperations.mockResolvedValue({
      records: [{ type: 'payment', to: 'GOTHER999', amount: '100.0', asset_type: 'native' }],
    });
    await expect(verifyTransaction('abc123', 'GTEST123')).rejects.toMatchObject({ code: 'INVALID_DESTINATION' });
  });

  test('throws UNSUPPORTED_ASSET for unsupported asset', async () => {
    mockOperations.mockResolvedValue({
      records: [{ type: 'payment', to: 'GTEST123', amount: '100.0', asset_type: 'credit_alphanum4', asset_code: 'SHIB', asset_issuer: 'GRANDOM' }],
    });
    await expect(verifyTransaction('abc123', 'GTEST123')).rejects.toMatchObject({ code: 'UNSUPPORTED_ASSET' });
  });

  test('feeValidation status is unknown when student not found', async () => {
    Student.findOne.mockResolvedValue(null);
    mockOperations.mockResolvedValue({
      records: [{ type: 'payment', to: 'GTEST123', amount: '100.0', asset_type: 'native' }],
    });
    const result = await verifyTransaction('abc123', 'GTEST123');
    expect(result.feeValidation.status).toBe('unknown');
  });
});

// ─── syncPayments ─────────────────────────────────────────────────────────────

describe('syncPaymentsForSchool', () => {
  test('resolves without error when no transactions exist', async () => {
    const school = { schoolId: 'SCH001', stellarAddress: 'GTEST123' };
    await expect(syncPaymentsForSchool(school)).resolves.toBeUndefined();
  });
});
