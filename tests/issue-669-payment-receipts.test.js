'use strict';

/**
 * Tests for Issue #669 — Payment receipt emails on successful payment confirmation
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const Payment = require('../backend/src/models/paymentModel');
const Student = require('../backend/src/models/studentModel');
const School = require('../backend/src/models/schoolModel');

// Mock email service
const mockEmailService = {
  sendPaymentReceipt: jest.fn().mockResolvedValue({ messageId: 'mock-id' }),
};

jest.mock('../backend/src/services/emailService', () => mockEmailService);
jest.mock('../backend/src/services/auditService');

describe('Issue #669 — Payment receipt emails', () => {
  let schoolId;
  let studentId;

  beforeAll(async () => {
    process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/stellaredupay-test';
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Payment.deleteMany({});
    await Student.deleteMany({});
    await School.deleteMany({});

    // Create test school
    const school = await School.create({
      schoolId: `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      name: 'Test School',
      slug: 'test-school-669',
      stellarAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VF',
      network: 'testnet',
    });
    schoolId = school.schoolId;

    // Create test student with contact email
    const student = await Student.create({
      schoolId,
      studentId: `STU-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      name: 'Test Student',
      class: 'Grade 5A',
      contactEmail: 'parent@example.com',
      feeAmount: 250,
    });
    studentId = student.studentId;
  });

  describe('Payment receipt email on SUCCESS transition', () => {
    it('should send receipt email when payment transitions to SUCCESS', async () => {
      const payment = await Payment.create({
        schoolId,
        studentId,
        txHash: `tx-${crypto.randomBytes(16).toString('hex')}`,
        amount: 250,
        feeAmount: 250,
        feeValidationStatus: 'valid',
        status: 'PENDING',
        memo: studentId,
        confirmedAt: new Date(),
      });

      // Simulate status transition to SUCCESS
      payment.status = 'SUCCESS';
      await payment.save();

      // Verify email service was called
      expect(mockEmailService.sendPaymentReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'parent@example.com',
          studentName: 'Test Student',
          amount: 250,
          txHash: payment.txHash,
          confirmedAt: expect.any(Date),
        })
      );
    });

    it('should skip receipt email if contactEmail is not set', async () => {
      // Create student without contactEmail
      const studentNoEmail = await Student.create({
        schoolId,
        studentId: `STU-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        name: 'No Email Student',
        class: 'Grade 5A',
        feeAmount: 250,
      });

      const payment = await Payment.create({
        schoolId,
        studentId: studentNoEmail.studentId,
        txHash: `tx-${crypto.randomBytes(16).toString('hex')}`,
        amount: 250,
        feeAmount: 250,
        feeValidationStatus: 'valid',
        status: 'PENDING',
        memo: studentNoEmail.studentId,
        confirmedAt: new Date(),
      });

      mockEmailService.sendPaymentReceipt.mockClear();

      // Transition to SUCCESS
      payment.status = 'SUCCESS';
      await payment.save();

      // Email service should not be called
      expect(mockEmailService.sendPaymentReceipt).not.toHaveBeenCalled();
    });

    it('should include remaining balance in receipt email', async () => {
      const payment = await Payment.create({
        schoolId,
        studentId,
        txHash: `tx-${crypto.randomBytes(16).toString('hex')}`,
        amount: 250,
        feeAmount: 250,
        feeValidationStatus: 'valid',
        status: 'PENDING',
        memo: studentId,
        confirmedAt: new Date(),
      });

      mockEmailService.sendPaymentReceipt.mockClear();

      payment.status = 'SUCCESS';
      await payment.save();

      expect(mockEmailService.sendPaymentReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          remainingBalance: expect.any(Number),
        })
      );
    });

    it('should not send receipt for non-SUCCESS transitions', async () => {
      const payment = await Payment.create({
        schoolId,
        studentId,
        txHash: `tx-${crypto.randomBytes(16).toString('hex')}`,
        amount: 250,
        feeAmount: 250,
        feeValidationStatus: 'valid',
        status: 'PENDING',
        memo: studentId,
      });

      mockEmailService.sendPaymentReceipt.mockClear();

      // Transition to FAILED
      payment.status = 'FAILED';
      await payment.save();

      expect(mockEmailService.sendPaymentReceipt).not.toHaveBeenCalled();
    });
  });
});
