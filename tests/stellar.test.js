'use strict';

// Must set required env vars before any module that loads config/index.js
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B';

const {
  verifyTransaction,
  syncPaymentsForSchool,
  parseIncomingTransaction,
  validatePaymentAgainstFee,
  detectAsset,
  normalizeAmount,
  extractValidPayment,
} = require('../backend/src/services/stellarService');

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockOperations = jest.fn();

jest.mock('../backend/src/config/stellarConfig', () => ({
  SCHOOL_WALLET: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B',
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
        order: () => ({ limit: () => ({ call: async () => ({ records: [], next: async () => ({ records: [] }) }) }) }),
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
  exists: jest.fn().mockResolvedValue(false),
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
    records: [{ type: 'payment', to: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B', amount: '100.0', asset_type: 'native' }],
  });

  test('returns payOp, memo, asset for a valid transaction', async () => {
    const tx = { successful: true, memo: 'STU001', operations: validOps };
    const result = await extractValidPayment(tx, 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B');
    expect(result).not.toBeNull();
    expect(result.memo).toBe('STU001');
    expect(result.asset.assetCode).toBe('XLM');
  });

  test('returns null for a failed transaction', async () => {
    const tx = { successful: false, memo: 'STU001', operations: validOps };
    expect(await extractValidPayment(tx, 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B')).toBeNull();
  });

  test('returns null when memo is missing', async () => {
    const tx = { successful: true, memo: undefined, operations: validOps };
    expect(await extractValidPayment(tx, 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B')).toBeNull();
  });

  test('returns null when memo is empty string', async () => {
    const tx = { successful: true, memo: '   ', operations: validOps };
    expect(await extractValidPayment(tx, 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B')).toBeNull();
  });

  test('returns null when no payment op to school wallet', async () => {
    const tx = {
      successful: true,
      memo: 'STU001',
      operations: async () => ({ records: [{ type: 'payment', to: 'GOTHER', amount: '100.0', asset_type: 'native' }] }),
    };
    expect(await extractValidPayment(tx, 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B')).toBeNull();
  });

  test('returns null for unsupported asset', async () => {
    const tx = {
      successful: true,
      memo: 'STU001',
      operations: async () => ({
        records: [{ type: 'payment', to: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B', amount: '100.0', asset_type: 'credit_alphanum4', asset_code: 'SHIB', asset_issuer: 'GRANDOM' }],
      }),
    };
    expect(await extractValidPayment(tx, 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B')).toBeNull();
  });
});

// ─── verifyTransaction ────────────────────────────────────────────────────────

describe('verifyTransaction', () => {
  beforeEach(() => {
    Student.findOne.mockResolvedValue({ studentId: 'STU001', feeAmount: 100 });
  });

  test('returns payment details with asset info for a valid XLM transaction', async () => {
    mockOperations.mockResolvedValue({
      records: [{ type: 'payment', to: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B', amount: '100.0', asset_type: 'native' }],
    });
    const result = await verifyTransaction('abc123', 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B');
    expect(result).toMatchObject({ hash: 'abc123', memo: 'STU001', amount: 100, assetCode: 'XLM', assetType: 'native' });
    expect(result.feeValidation.status).toBe('valid');
  });

  test('throws INVALID_DESTINATION when no matching payment op', async () => {
    mockOperations.mockResolvedValue({ records: [] });
    await expect(verifyTransaction('abc123', 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B')).rejects.toMatchObject({ code: 'INVALID_DESTINATION' });
  });

  test('throws INVALID_DESTINATION when payment is to a different wallet', async () => {
    mockOperations.mockResolvedValue({
      records: [{ type: 'payment', to: 'GOTHER999', amount: '100.0', asset_type: 'native' }],
    });
    await expect(verifyTransaction('abc123', 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B')).rejects.toMatchObject({ code: 'INVALID_DESTINATION' });
  });

  test('throws UNSUPPORTED_ASSET for unsupported asset', async () => {
    mockOperations.mockResolvedValue({
      records: [{ type: 'payment', to: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B', amount: '100.0', asset_type: 'credit_alphanum4', asset_code: 'SHIB', asset_issuer: 'GRANDOM' }],
    });
    await expect(verifyTransaction('abc123', 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B')).rejects.toMatchObject({ code: 'UNSUPPORTED_ASSET' });
  });

  test('feeValidation status is unknown when student not found', async () => {
    Student.findOne.mockResolvedValue(null);
    mockOperations.mockResolvedValue({
      records: [{ type: 'payment', to: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B', amount: '100.0', asset_type: 'native' }],
    });
    const result = await verifyTransaction('abc123', 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B');
    expect(result.feeValidation.status).toBe('unknown');
  });
});

// ─── parseIncomingTransaction ─────────────────────────────────────────────────

describe('parseIncomingTransaction', () => {
  test('correctly extracts memo and amount from payment op', async () => {
    const txHash = 'abc123';

    mockOperations.mockResolvedValue({
      records: [
        { type: 'payment', from: 'GFROM', to: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B', amount: '150.0', asset_type: 'native' },
        { type: 'payment', from: 'GFROM', to: 'GOTHER', amount: '50.0', asset_type: 'native' },
      ],
    });

    const parsed = await parseIncomingTransaction(txHash, 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B');
    expect(parsed.memo).toBe('STU001');
    expect(parsed.payments).toHaveLength(1);
    expect(parsed.payments[0]).toMatchObject({
      from: 'GFROM',
      to: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B',
      amount: 150.0,
      assetCode: 'XLM',
      assetType: 'native',
    });
  });
});

// ─── syncPayments ─────────────────────────────────────────────────────────────

// Shared mock transaction factory for sync tests
function makeSyncTx(amount, memo = 'STU001') {
  return {
    hash: `tx-${amount}`,
    successful: true,
    memo,
    created_at: new Date().toISOString(),
    ledger_attr: 90, // below CONFIRMATION_THRESHOLD of 2 from sequence 100 → confirmed
    operations: jest.fn().mockResolvedValue({
      records: [{
        type: 'payment',
        to: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B',
        from: 'GSENDER',
        amount: String(amount),
        asset_type: 'native',
      }],
    }),
  };
}

const stellarConfig = require('../backend/src/config/stellarConfig');

describe('syncPaymentsForSchool', () => {
  const school = { schoolId: 'SCH001', stellarAddress: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B' };

  beforeEach(() => {
    jest.clearAllMocks();
    Payment.findOne.mockResolvedValue(null); // tx not yet recorded
    Payment.exists.mockResolvedValue(false);
  });

  test('resolves without error when no transactions exist', async () => {
    await expect(syncPaymentsForSchool(school)).resolves.toBeUndefined();
  });

  test('stops pagination when a known txHash is encountered', async () => {
    const school = { schoolId: 'SCH001', stellarAddress: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B' };

    // 200 new records on page 1 (full page → triggers next())
    const page1Records = Array.from({ length: 200 }, (_, i) => ({
      hash: `tx_new_${i}`, successful: false, memo: null, created_at: new Date().toISOString(),
    }));
    // Page 2 has one already-known record → pagination stops
    const page2Records = [{ hash: 'known_tx', successful: false, memo: null, created_at: new Date().toISOString() }];

    const nextFn = jest.fn().mockResolvedValue({ records: page2Records, next: jest.fn() });

    // Override the stellarConfig mock for this test only
    const stellarConfig = require('../backend/src/config/stellarConfig');
    const origTransactions = stellarConfig.server.transactions;
    stellarConfig.server.transactions = () => ({
      forAccount: () => ({
        order: () => ({ limit: () => ({ call: async () => ({ records: page1Records, next: nextFn }) }) }),
      }),
    });

    // All page1 records are new (null), then the page2 record is known
    Payment.findOne
      .mockResolvedValue(null)
      .mockResolvedValueOnce({ hash: 'known_tx' }); // called for page2[0] → stop

    // Reset so page1 records all return null first
    Payment.findOne.mockReset();
    Payment.findOne.mockResolvedValue(null); // default: all unknown
    // Override for the first call on page2 (201st call overall)
    const calls = [];
    Payment.findOne.mockImplementation(({ txHash }) => {
      calls.push(txHash);
      if (txHash === 'known_tx') return Promise.resolve({ hash: 'known_tx' });
      return Promise.resolve(null);
    });

    await syncPaymentsForSchool(school);

    expect(nextFn).toHaveBeenCalledTimes(1);

    // Restore
    stellarConfig.server.transactions = origTransactions;
    Payment.findOne.mockReset();
    Payment.findOne.mockResolvedValue(null);
  });
});
