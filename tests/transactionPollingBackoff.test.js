'use strict';

/**
 * Tests for exponential backoff in transactionPollingService (issue #451).
 *
 * We test the backoff logic by mocking School.find and the Stellar server,
 * then calling pollAllSchools() directly and inspecting the backoff state.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(true),
  Schema: class { constructor() { this.index = jest.fn(); } },
  model: jest.fn().mockReturnValue({}),
  connection: { startSession: jest.fn() },
}));

const mockTransactionsCall = jest.fn();
jest.mock('../backend/src/config/stellarConfig', () => ({
  server: {
    transactions: () => ({
      forAccount: () => ({
        order: () => ({
          limit: () => ({ call: mockTransactionsCall }),
        }),
      }),
    }),
  },
}));

jest.mock('../backend/src/models/schoolModel', () => ({
  find: jest.fn(),
}));
jest.mock('../backend/src/models/paymentModel', () => ({
  findOne: jest.fn().mockResolvedValue(null),
  aggregate: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({}),
}));
jest.mock('../backend/src/models/studentModel', () => ({
  findOne: jest.fn().mockResolvedValue(null),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));
jest.mock('../backend/src/services/stellarService', () => ({
  extractValidPayment: jest.fn().mockResolvedValue(null),
  validatePaymentAgainstFee: jest.fn().mockReturnValue({ status: 'valid' }),
  detectMemoCollision: jest.fn().mockResolvedValue({ suspicious: false }),
  detectAbnormalPatterns: jest.fn().mockResolvedValue({ suspicious: false }),
  checkConfirmationStatus: jest.fn().mockResolvedValue(true),
}));
jest.mock('../backend/src/services/sseService', () => ({ emit: jest.fn() }));
jest.mock('../backend/src/utils/paymentLimits', () => ({
  validatePaymentAmount: jest.fn().mockReturnValue({ valid: true }),
}));
jest.mock('../backend/src/utils/generateReferenceCode', () => ({
  generateReferenceCode: jest.fn().mockResolvedValue('REF001'),
}));
jest.mock('../backend/src/utils/logger', () => ({
  child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const School = require('../backend/src/models/schoolModel');
const { pollAllSchools, _getBackoffState, _resetBackoffState } = require('../backend/src/services/transactionPollingService');

const MOCK_SCHOOL = { schoolId: 'SCH001', stellarAddress: 'GTEST...', isActive: true };
const POLL_INTERVAL_MS = 30000;
const MAX_BACKOFF_MS = parseInt(process.env.POLL_MAX_BACKOFF_MS || '300000', 10);

beforeEach(() => {
  _resetBackoffState();
  jest.clearAllMocks();
  School.find.mockResolvedValue([MOCK_SCHOOL]);
});

describe('transactionPollingService — exponential backoff (#451)', () => {
  test('interval stays at normal value after a successful poll', async () => {
    mockTransactionsCall.mockResolvedValue({ records: [] });
    await pollAllSchools();
    const { consecutiveErrors, currentIntervalMs } = _getBackoffState();
    expect(consecutiveErrors).toBe(0);
    expect(currentIntervalMs).toBe(POLL_INTERVAL_MS);
  });

  test('interval doubles after first Horizon error', async () => {
    mockTransactionsCall.mockRejectedValue(new Error('Horizon timeout'));
    await pollAllSchools();
    const { consecutiveErrors, currentIntervalMs } = _getBackoffState();
    expect(consecutiveErrors).toBe(1);
    expect(currentIntervalMs).toBe(POLL_INTERVAL_MS * 2);
  });

  test('interval doubles again after second consecutive error', async () => {
    mockTransactionsCall.mockRejectedValue(new Error('Horizon timeout'));
    await pollAllSchools();
    await pollAllSchools();
    const { consecutiveErrors, currentIntervalMs } = _getBackoffState();
    expect(consecutiveErrors).toBe(2);
    expect(currentIntervalMs).toBe(POLL_INTERVAL_MS * 4);
  });

  test('interval is capped at POLL_MAX_BACKOFF_MS', async () => {
    mockTransactionsCall.mockRejectedValue(new Error('Horizon timeout'));
    // Run enough cycles to exceed the cap
    for (let i = 0; i < 10; i++) {
      await pollAllSchools();
    }
    const { currentIntervalMs } = _getBackoffState();
    expect(currentIntervalMs).toBeLessThanOrEqual(MAX_BACKOFF_MS);
    expect(currentIntervalMs).toBe(MAX_BACKOFF_MS);
  });

  test('interval resets to normal after a successful poll following errors', async () => {
    mockTransactionsCall.mockRejectedValue(new Error('Horizon timeout'));
    await pollAllSchools();
    await pollAllSchools();
    // Now recover
    mockTransactionsCall.mockResolvedValue({ records: [] });
    await pollAllSchools();
    const { consecutiveErrors, currentIntervalMs } = _getBackoffState();
    expect(consecutiveErrors).toBe(0);
    expect(currentIntervalMs).toBe(POLL_INTERVAL_MS);
  });

  test('no schools — interval stays normal', async () => {
    School.find.mockResolvedValue([]);
    await pollAllSchools();
    const { consecutiveErrors, currentIntervalMs } = _getBackoffState();
    expect(consecutiveErrors).toBe(0);
    expect(currentIntervalMs).toBe(POLL_INTERVAL_MS);
  });
});
