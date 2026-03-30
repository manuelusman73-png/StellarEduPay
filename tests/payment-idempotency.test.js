'use strict';

/**
 * Tests for payment verification idempotency
 * Verifies that repeated verification requests return cached results
 */

// Set required env vars before loading modules
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B';

const request = require('supertest');

// Mock dependencies
jest.mock('../backend/src/config/database', () => ({
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true),
  healthCheck: jest.fn().mockResolvedValue({ healthy: true }),
}));

jest.mock('../backend/src/models/paymentModel', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../backend/src/models/studentModel', () => ({
  findOne: jest.fn(),
}));

jest.mock('../backend/src/models/schoolModel', () => ({
  findOne: jest.fn(),
}));

jest.mock('../backend/src/models/paymentIntentModel', () => ({
  findOne: jest.fn(),
}));

jest.mock('../backend/src/services/stellarService', () => ({
  verifyTransaction: jest.fn(),
}));

jest.mock('../backend/src/services/currencyConversionService', () => ({
  convertToLocalCurrency: jest.fn().mockResolvedValue({
    available: true,
    localAmount: 1200.0,
    currency: 'USD',
    rate: 12.0,
    rateTimestamp: new Date().toISOString(),
  }),
}));

const Payment = require('../backend/src/models/paymentModel');
const Student = require('../backend/src/models/studentModel');
const School = require('../backend/src/models/schoolModel');
const PaymentIntent = require('../backend/src/models/paymentIntentModel');
const { verifyTransaction } = require('../backend/src/services/stellarService');

describe('Payment Verification Idempotency', () => {
  let app;

  beforeAll(() => {
    // Load app after mocks are set up
    app = require('../backend/src/app');
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default school mock
    School.findOne.mockResolvedValue({
      schoolId: 'SCH001',
      stellarAddress: 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B',
      localCurrency: 'USD',
    });
  });

  describe('First verification (fresh)', () => {
    test('returns cached: false for new transaction', async () => {
      const txHash = 'abc123def456';

      // No existing payment
      Payment.findOne.mockResolvedValue(null);

      // Mock student
      Student.findOne.mockResolvedValue({
        studentId: 'STU001',
        feeAmount: 100,
      });

      // Mock payment intent
      PaymentIntent.findOne.mockResolvedValue({
        memo: 'STU001',
        studentId: 'STU001',
        amount: 100,
        status: 'pending',
      });

      // Mock Horizon verification
      verifyTransaction.mockResolvedValue({
        hash: txHash,
        memo: 'STU001',
        studentId: 'STU001',
        amount: 100,
        assetCode: 'XLM',
        assetType: 'native',
        feeAmount: 100,
        feeValidation: {
          status: 'valid',
          message: 'Payment matches required fee',
          excessAmount: 0,
        },
        networkFee: 0.00001,
        date: new Date().toISOString(),
        senderAddress: 'GSENDER',
        ledger: 12345,
      });

      // Mock payment creation
      Payment.create.mockResolvedValue({
        txHash,
        studentId: 'STU001',
        amount: 100,
      });

      const response = await request(app)
        .post('/api/payments/verify')
        .send({ txHash })
        .expect(200);

      expect(response.body).toMatchObject({
        verified: true,
        cached: false,
        hash: txHash,
        memo: 'STU001',
        studentId: 'STU001',
        amount: 100,
      });

      // Verify Horizon was called
      expect(verifyTransaction).toHaveBeenCalledWith(
        txHash,
        'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B'
      );
    });
  });

  describe('Second verification (cached)', () => {
    test('returns cached: true for existing payment', async () => {
      const txHash = 'abc123def456';

      // Existing payment in database
      Payment.findOne.mockResolvedValue({
        txHash,
        studentId: 'STU001',
        memo: 'STU001',
        amount: 100,
        assetCode: 'XLM',
        assetType: 'native',
        feeAmount: 100,
        feeValidationStatus: 'valid',
        excessAmount: 0,
        status: 'SUCCESS',
        confirmationStatus: 'confirmed',
        confirmedAt: new Date(),
        createdAt: new Date(),
      });

      const response = await request(app)
        .post('/api/payments/verify')
        .send({ txHash })
        .expect(200);

      expect(response.body).toMatchObject({
        verified: true,
        cached: true,
        hash: txHash,
        memo: 'STU001',
        studentId: 'STU001',
        amount: 100,
        status: 'SUCCESS',
        confirmationStatus: 'confirmed',
      });

      // Verify Horizon was NOT called
      expect(verifyTransaction).not.toHaveBeenCalled();
    });

    test('includes all payment details in cached response', async () => {
      const txHash = 'xyz789abc123';

      Payment.findOne.mockResolvedValue({
        txHash,
        studentId: 'STU002',
        memo: 'STU002',
        amount: 200.5,
        assetCode: 'XLM',
        assetType: 'native',
        feeAmount: 200,
        feeValidationStatus: 'overpaid',
        excessAmount: 0.5,
        status: 'SUCCESS',
        confirmationStatus: 'confirmed',
        networkFee: 0.00001,
        confirmedAt: new Date('2024-03-30T10:00:00Z'),
        createdAt: new Date('2024-03-30T10:00:00Z'),
      });

      const response = await request(app)
        .post('/api/payments/verify')
        .send({ txHash })
        .expect(200);

      expect(response.body).toMatchObject({
        verified: true,
        cached: true,
        hash: txHash,
        memo: 'STU002',
        studentId: 'STU002',
        amount: 200.5,
        assetCode: 'XLM',
        assetType: 'native',
        feeAmount: 200,
        feeValidation: {
          status: 'overpaid',
          excessAmount: 0.5,
        },
        status: 'SUCCESS',
        confirmationStatus: 'confirmed',
      });

      expect(response.body.localCurrency).toBeDefined();
      expect(response.body.stellarExplorerUrl).toBeDefined();
    });
  });

  describe('Multiple verification attempts', () => {
    test('first call is fresh, subsequent calls are cached', async () => {
      const txHash = 'multi123';

      // First call - no existing payment
      Payment.findOne.mockResolvedValueOnce(null);

      Student.findOne.mockResolvedValue({
        studentId: 'STU003',
        feeAmount: 150,
      });

      PaymentIntent.findOne.mockResolvedValue({
        memo: 'STU003',
        studentId: 'STU003',
        amount: 150,
        status: 'pending',
      });

      verifyTransaction.mockResolvedValue({
        hash: txHash,
        memo: 'STU003',
        studentId: 'STU003',
        amount: 150,
        assetCode: 'XLM',
        assetType: 'native',
        feeAmount: 150,
        feeValidation: {
          status: 'valid',
          excessAmount: 0,
        },
        date: new Date().toISOString(),
      });

      Payment.create.mockResolvedValue({ txHash });

      // First verification
      const response1 = await request(app)
        .post('/api/payments/verify')
        .send({ txHash })
        .expect(200);

      expect(response1.body.cached).toBe(false);
      expect(verifyTransaction).toHaveBeenCalledTimes(1);

      // Second call - payment now exists
      Payment.findOne.mockResolvedValue({
        txHash,
        studentId: 'STU003',
        memo: 'STU003',
        amount: 150,
        assetCode: 'XLM',
        assetType: 'native',
        feeAmount: 150,
        feeValidationStatus: 'valid',
        excessAmount: 0,
        status: 'SUCCESS',
        confirmationStatus: 'confirmed',
        confirmedAt: new Date(),
      });

      // Second verification
      const response2 = await request(app)
        .post('/api/payments/verify')
        .send({ txHash })
        .expect(200);

      expect(response2.body.cached).toBe(true);
      expect(verifyTransaction).toHaveBeenCalledTimes(1); // Still only called once

      // Third verification
      const response3 = await request(app)
        .post('/api/payments/verify')
        .send({ txHash })
        .expect(200);

      expect(response3.body.cached).toBe(true);
      expect(verifyTransaction).toHaveBeenCalledTimes(1); // Still only called once
    });
  });

  describe('Performance', () => {
    test('cached response is faster than fresh verification', async () => {
      const txHash = 'perf123';

      // Simulate slow Horizon call
      verifyTransaction.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              hash: txHash,
              memo: 'STU004',
              amount: 100,
              feeValidation: { status: 'valid' },
            });
          }, 200); // 200ms delay
        });
      });

      Payment.findOne.mockResolvedValue({
        txHash,
        studentId: 'STU004',
        memo: 'STU004',
        amount: 100,
        feeValidationStatus: 'valid',
        status: 'SUCCESS',
        confirmationStatus: 'confirmed',
        confirmedAt: new Date(),
      });

      const start = Date.now();
      await request(app)
        .post('/api/payments/verify')
        .send({ txHash })
        .expect(200);
      const duration = Date.now() - start;

      // Cached response should be much faster (< 100ms)
      expect(duration).toBeLessThan(100);
      expect(verifyTransaction).not.toHaveBeenCalled();
    });
  });
});
