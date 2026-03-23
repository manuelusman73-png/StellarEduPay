const { verifyTransaction, syncPayments, validatePaymentAgainstFee } = require('../backend/src/services/stellarService');

jest.mock('../backend/src/config/stellarConfig', () => ({
  SCHOOL_WALLET: 'GTEST123',
  ACCEPTED_ASSETS: {
    XLM: { code: 'XLM', type: 'native', issuer: null, displayName: 'Stellar Lumens', decimals: 7 },
    USDC: { code: 'USDC', type: 'credit_alphanum4', issuer: 'GISSUER', displayName: 'USD Coin', decimals: 7 },
  },
  isAcceptedAsset: (code, type) => {
    const assets = {
      XLM: { code: 'XLM', type: 'native' },
      USDC: { code: 'USDC', type: 'credit_alphanum4' },
    };
    const asset = assets[code];
    if (!asset || asset.type !== type) return { accepted: false, asset: null };
    return { accepted: true, asset };
  },
  server: {
    transactions: () => ({
      forAccount: () => ({
        order: () => ({ limit: () => ({ call: async () => ({ records: [] }) }) }),
      }),
      transaction: (hash) => ({
        call: async () => ({
          hash,
          memo: 'STU001',
          created_at: new Date().toISOString(),
          operations: async () => ({
<<<<<<< feature/multi-asset-payment-support
            records: [{ type: 'payment', to: 'GTEST123', amount: '100.0000000', asset_type: 'native' }],
=======
            records: [{ type: 'payment', to: 'GTEST123', amount: '200.0' }],
>>>>>>> main
          }),
        }),
      }),
    }),
  },
}));

jest.mock('../backend/src/models/paymentModel', () => ({
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
}));

jest.mock('../backend/src/models/studentModel', () => ({
  findOne: jest.fn().mockResolvedValue({ studentId: 'STU001', feeAmount: 200 }),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));

describe('stellarService', () => {
  test('syncPayments runs without error', async () => {
    await expect(syncPayments()).resolves.toBeUndefined();
  });

<<<<<<< feature/multi-asset-payment-support
  test('verifyTransaction returns payment details with asset info', async () => {
=======
  test('verifyTransaction returns payment details with fee validation', async () => {
>>>>>>> main
    const result = await verifyTransaction('abc123');
    expect(result).toMatchObject({
      hash: 'abc123',
      memo: 'STU001',
<<<<<<< feature/multi-asset-payment-support
      amount: 100,
      assetCode: 'XLM',
      assetType: 'native',
    });
  });

  test('detectAsset returns null for unsupported asset', () => {
    const payOp = { asset_type: 'credit_alphanum4', asset_code: 'SHIB', asset_issuer: 'GRANDOM' };
    const result = detectAsset(payOp);
    expect(result).toBeNull();
  });

  test('detectAsset recognizes native XLM', () => {
    const payOp = { asset_type: 'native' };
    const result = detectAsset(payOp);
    expect(result).toEqual({ assetCode: 'XLM', assetType: 'native', assetIssuer: null });
  });

  test('detectAsset recognizes USDC', () => {
    const payOp = { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUER' };
    const result = detectAsset(payOp);
    expect(result).toEqual({ assetCode: 'USDC', assetType: 'credit_alphanum4', assetIssuer: 'GISSUER' });
  });

  test('normalizeAmount formats amounts consistently', () => {
    expect(normalizeAmount('100.123456789')).toBe(100.1234568);
    expect(normalizeAmount('200')).toBe(200.0);
    expect(normalizeAmount('0.0000001')).toBe(0.0000001);
=======
      amount: 200,
      feeAmount: 200,
    });
    expect(result.feeValidation).toHaveProperty('status', 'valid');
  });
});

describe('validatePaymentAgainstFee', () => {
  test('returns valid when payment matches fee', () => {
    const result = validatePaymentAgainstFee(200, 200);
    expect(result.status).toBe('valid');
  });

  test('returns underpaid when payment is less than fee', () => {
    const result = validatePaymentAgainstFee(150, 200);
    expect(result.status).toBe('underpaid');
  });

  test('returns overpaid when payment exceeds fee', () => {
    const result = validatePaymentAgainstFee(250, 200);
    expect(result.status).toBe('overpaid');
>>>>>>> main
  });
});
