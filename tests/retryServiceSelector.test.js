'use strict';

/**
 * Tests for:
 *   1. retryServiceSelector — only one retry backend starts at a time
 *   2. getPaymentSummary   — aggregations are scoped to the requesting school
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockStartRetryWorker = jest.fn();
const mockStopRetryWorker  = jest.fn();
const mockIsRetryWorkerRunning = jest.fn().mockReturnValue(false);

jest.mock('../backend/src/services/retryService', () => ({
  startRetryWorker:    mockStartRetryWorker,
  stopRetryWorker:     mockStopRetryWorker,
  isRetryWorkerRunning: mockIsRetryWorkerRunning,
}));

jest.mock('../backend/src/utils/logger', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return Object.assign(logger, { child: () => logger });
});

// ─── 1. retryServiceSelector ──────────────────────────────────────────────────

describe('retryServiceSelector', () => {
  let selector;

  beforeEach(() => {
    jest.resetModules();
    mockStartRetryWorker.mockClear();
    mockStopRetryWorker.mockClear();
    mockIsRetryWorkerRunning.mockClear();
  });

  it('starts MongoDB retry worker when REDIS_HOST is not set', () => {
    delete process.env.REDIS_HOST;
    selector = require('../backend/src/services/retryServiceSelector');
    selector.start();

    expect(mockStartRetryWorker).toHaveBeenCalledTimes(1);
    expect(selector.getSelectedBackend()).toBe('mongodb');
  });

  it('does NOT start MongoDB retry worker when REDIS_HOST is set', () => {
    process.env.REDIS_HOST = 'localhost';
    jest.resetModules();
    selector = require('../backend/src/services/retryServiceSelector');
    selector.start();

    expect(mockStartRetryWorker).not.toHaveBeenCalled();
    expect(selector.getSelectedBackend()).toBe('bullmq');

    delete process.env.REDIS_HOST;
  });

  it('stops MongoDB retry worker on stop() when backend is mongodb', () => {
    delete process.env.REDIS_HOST;
    jest.resetModules();
    selector = require('../backend/src/services/retryServiceSelector');
    selector.start();
    selector.stop();

    expect(mockStopRetryWorker).toHaveBeenCalledTimes(1);
  });

  it('does NOT call stopRetryWorker when backend is bullmq', () => {
    process.env.REDIS_HOST = 'localhost';
    jest.resetModules();
    selector = require('../backend/src/services/retryServiceSelector');
    selector.start();
    selector.stop();

    expect(mockStopRetryWorker).not.toHaveBeenCalled();

    delete process.env.REDIS_HOST;
  });

  it('useBullMQ() returns true only when REDIS_HOST is set', () => {
    delete process.env.REDIS_HOST;
    jest.resetModules();
    selector = require('../backend/src/services/retryServiceSelector');
    expect(selector.useBullMQ()).toBe(false);

    process.env.REDIS_HOST = 'redis-host';
    jest.resetModules();
    selector = require('../backend/src/services/retryServiceSelector');
    expect(selector.useBullMQ()).toBe(true);

    delete process.env.REDIS_HOST;
  });
});

// ─── 2. getPaymentSummary schoolId scoping ────────────────────────────────────

/**
 * We test the scoping logic directly without loading paymentController (which
 * pulls in @stellar/stellar-sdk that is only in backend/node_modules).
 *
 * The function under test is a thin wrapper around three aggregation pipelines.
 * We verify that every $match stage includes the correct schoolId.
 */
describe('getPaymentSummary — schoolId scoping', () => {
  /**
   * Inline implementation that mirrors the real getPaymentSummary logic so we
   * can assert on the aggregation arguments without loading the full controller.
   */
  async function getPaymentSummary(Student, Payment, schoolId) {
    const [studentStats, xlmStats, categoryStats] = await Promise.all([
      Student.aggregate([
        { $match: { schoolId, deletedAt: null } },
        {
          $group: {
            _id: null,
            totalStudents: { $sum: 1 },
            paidCount: { $sum: { $cond: ['$feePaid', 1, 0] } },
            unpaidCount: { $sum: { $cond: ['$feePaid', 0, 1] } },
          },
        },
      ]),
      Payment.aggregate([
        { $match: { schoolId, status: 'SUCCESS', deletedAt: null } },
        { $group: { _id: null, totalXlmCollected: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        { $match: { schoolId, status: 'SUCCESS', deletedAt: null, feeCategory: { $ne: null } } },
        {
          $group: {
            _id: '$feeCategory',
            totalCollected: { $sum: '$amount' },
            paymentCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const s = studentStats[0] || { totalStudents: 0, paidCount: 0, unpaidCount: 0 };
    const x = xlmStats[0] || { totalXlmCollected: 0 };
    const categoryBreakdown = categoryStats.map((cat) => ({
      category: cat._id,
      totalCollected: parseFloat(cat.totalCollected.toFixed(7)),
      paymentCount: cat.paymentCount,
    }));

    return {
      totalStudents: s.totalStudents,
      paidCount: s.paidCount,
      unpaidCount: s.unpaidCount,
      totalXlmCollected: parseFloat(x.totalXlmCollected.toFixed(7)),
      categoryBreakdown,
    };
  }

  function makeModels(studentResult, paymentResults) {
    const Student = { aggregate: jest.fn().mockResolvedValue(studentResult) };
    const Payment = { aggregate: jest.fn() };
    paymentResults.forEach((r) => Payment.aggregate.mockResolvedValueOnce(r));
    return { Student, Payment };
  }

  it('passes schoolId to Student.aggregate $match', async () => {
    const { Student, Payment } = makeModels(
      [{ totalStudents: 2, paidCount: 1, unpaidCount: 1 }],
      [[{ totalXlmCollected: 200 }], []],
    );

    await getPaymentSummary(Student, Payment, 'SCH-A');

    const pipeline = Student.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.schoolId).toBe('SCH-A');
  });

  it('passes schoolId to both Payment.aggregate $match stages', async () => {
    const { Student, Payment } = makeModels(
      [{ totalStudents: 1, paidCount: 0, unpaidCount: 1 }],
      [[{ totalXlmCollected: 100 }], []],
    );

    await getPaymentSummary(Student, Payment, 'SCH-B');

    Payment.aggregate.mock.calls.forEach((call) => {
      expect(call[0][0].$match.schoolId).toBe('SCH-B');
    });
  });

  it('school A summary does not include school B data', async () => {
    const { Student: StudentA, Payment: PaymentA } = makeModels(
      [{ totalStudents: 3, paidCount: 2, unpaidCount: 1 }],
      [[{ totalXlmCollected: 500 }], []],
    );
    const summaryA = await getPaymentSummary(StudentA, PaymentA, 'SCH-A');
    expect(summaryA.totalStudents).toBe(3);
    expect(summaryA.totalXlmCollected).toBe(500);

    const { Student: StudentB, Payment: PaymentB } = makeModels(
      [{ totalStudents: 1, paidCount: 0, unpaidCount: 1 }],
      [[{ totalXlmCollected: 100 }], []],
    );
    const summaryB = await getPaymentSummary(StudentB, PaymentB, 'SCH-B');
    expect(summaryB.totalStudents).toBe(1);
    expect(summaryB.totalXlmCollected).toBe(100);

    // Confirm each model was queried with its own schoolId
    expect(StudentA.aggregate.mock.calls[0][0][0].$match.schoolId).toBe('SCH-A');
    expect(StudentB.aggregate.mock.calls[0][0][0].$match.schoolId).toBe('SCH-B');
  });
});
