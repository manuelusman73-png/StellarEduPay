'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { generateReport } = require('../backend/src/services/reportService');
const Payment = require('../backend/src/models/paymentModel');
const Student = require('../backend/src/models/studentModel');

describe('Report date range handling (#649)', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Payment.deleteMany({});
    await Student.deleteMany({});
  });

  it('should support date ranges longer than 365 days', async () => {
    const schoolId = 'SCH-TEST';

    // Create payments spanning 730 days (2 years)
    const startDate = new Date('2024-01-01');
    for (let i = 0; i < 730; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      await Payment.create({
        schoolId,
        txHash: `tx-${i}`,
        studentId: `STU-${i % 10}`,
        amount: 100,
        feeAmount: 100,
        feeValidationStatus: 'valid',
        status: 'SUCCESS',
        confirmedAt: date,
        studentDeleted: false,
        deletedAt: null,
      });
    }

    // Create students
    for (let i = 0; i < 10; i++) {
      await Student.create({
        schoolId,
        studentId: `STU-${i}`,
        name: `Student ${i}`,
        class: 'Grade 5',
        feeAmount: 100,
        feePaid: true,
      });
    }

    // Generate report for 2-year range
    const report = await generateReport({
      schoolId,
      startDate: '2024-01-01',
      endDate: '2025-12-31',
      timezone: 'UTC',
    });

    // Should return all 730 payments, not truncated to 365
    expect(report.summary.paymentCount).toBe(730);
    expect(report.dateRangeDays).toBe(731); // 2024 is leap year
  });

  it('should include dateRangeDays in response', async () => {
    const schoolId = 'SCH-TEST';

    await Payment.create({
      schoolId,
      txHash: 'tx-1',
      studentId: 'STU-001',
      amount: 100,
      feeAmount: 100,
      feeValidationStatus: 'valid',
      status: 'SUCCESS',
      confirmedAt: new Date('2026-01-15'),
      studentDeleted: false,
      deletedAt: null,
    });

    const report = await generateReport({
      schoolId,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      timezone: 'UTC',
    });

    expect(report.dateRangeDays).toBe(31);
  });

  it('should return null dateRangeDays for all-time reports', async () => {
    const schoolId = 'SCH-TEST';

    await Payment.create({
      schoolId,
      txHash: 'tx-1',
      studentId: 'STU-001',
      amount: 100,
      feeAmount: 100,
      feeValidationStatus: 'valid',
      status: 'SUCCESS',
      confirmedAt: new Date('2026-01-15'),
      studentDeleted: false,
      deletedAt: null,
    });

    const report = await generateReport({
      schoolId,
      timezone: 'UTC',
    });

    expect(report.dateRangeDays).toBeNull();
  });

  it('should handle 30-day, 365-day, and 730-day ranges correctly', async () => {
    const schoolId = 'SCH-TEST';

    // Create payments for 730 days
    const startDate = new Date('2024-01-01');
    for (let i = 0; i < 730; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      await Payment.create({
        schoolId,
        txHash: `tx-${i}`,
        studentId: 'STU-001',
        amount: 100,
        feeAmount: 100,
        feeValidationStatus: 'valid',
        status: 'SUCCESS',
        confirmedAt: date,
        studentDeleted: false,
        deletedAt: null,
      });
    }

    await Student.create({
      schoolId,
      studentId: 'STU-001',
      name: 'Student 1',
      class: 'Grade 5',
      feeAmount: 100,
      feePaid: true,
    });

    // 30-day range
    const report30 = await generateReport({
      schoolId,
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      timezone: 'UTC',
    });
    expect(report30.dateRangeDays).toBe(31);
    expect(report30.summary.paymentCount).toBe(31);

    // 365-day range
    const report365 = await generateReport({
      schoolId,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      timezone: 'UTC',
    });
    expect(report365.dateRangeDays).toBe(366); // 2024 is leap year
    expect(report365.summary.paymentCount).toBe(366);

    // 730-day range
    const report730 = await generateReport({
      schoolId,
      startDate: '2024-01-01',
      endDate: '2025-12-31',
      timezone: 'UTC',
    });
    expect(report730.dateRangeDays).toBe(731);
    expect(report730.summary.paymentCount).toBe(730);
  });
});
