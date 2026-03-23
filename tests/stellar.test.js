const { verifyTransaction, syncPayments } = require('../backend/src/services/stellarService');

jest.mock('../backend/src/config/stellarConfig', () => ({
  SCHOOL_WALLET: 'GTEST123',
  TRANSACTION_TIME_WINDOW_MS: 24 * 60 * 60 * 1000,
  server: {
    transactions: () => ({
      forAccount: () => ({
        order: () => ({ limit: () => ({ call: async () => ({ records: [] }) }) }),
      }),
      transaction: (txHash) => ({
        call: async () => {
          // If hash is 'old_tx', return date 2 days ago
          const created_at = txHash === 'old_tx' 
            ? new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
            : new Date().toISOString();
          return {
            hash: txHash,
            memo: 'STU001',
            created_at,
            operations: async () => ({
              records: [{ type: 'payment', to: 'GTEST123', amount: '100.0' }],
            }),
          };
        },
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
  findOne: jest.fn().mockResolvedValue({ studentId: 'STU001' }),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));

describe('stellarService', () => {
  test('syncPayments runs without error', async () => {
    await expect(syncPayments()).resolves.toBeUndefined();
  });

  test('verifyTransaction returns payment details', async () => {
    const result = await verifyTransaction('abc123');
    expect(result).toMatchObject({ hash: 'abc123', memo: 'STU001', amount: 100 });
  });

  test('verifyTransaction rejects old transaction', async () => {
    await expect(verifyTransaction('old_tx')).rejects.toThrow('Transaction is too old and cannot be processed.');
  });
});
