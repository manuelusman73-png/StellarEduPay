'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const PaymentPlan = require('../backend/src/models/paymentPlanModel');
const Student = require('../backend/src/models/studentModel');
const School = require('../backend/src/models/schoolModel');

let mongoServer;
const schoolId = 'SCH-TEST-PLAN';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await PaymentPlan.deleteMany({});
  await Student.deleteMany({});
  await School.deleteMany({});

  await School.create({
    schoolId,
    name: 'Test School',
    stellarAddress: 'GSCHOOL123456789',
  });

  await Student.create({
    schoolId,
    studentId: 'STU001',
    name: 'Alice Johnson',
    class: 'Grade 5A',
    feeAmount: 1000,
  });
});

describe('Payment Plan Model', () => {
  test('should create a payment plan with installments', async () => {
    const now = new Date();
    const plan = await PaymentPlan.create({
      schoolId,
      studentId: 'STU001',
      totalAmount: 1000,
      installments: [
        { amount: 500, dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
        { amount: 500, dueDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
      ],
    });

    expect(plan).toBeDefined();
    expect(plan.studentId).toBe('STU001');
    expect(plan.totalAmount).toBe(1000);
    expect(plan.installments).toHaveLength(2);
    expect(plan.status).toBe('active');
  });

  test('should calculate totalPaid virtual correctly', async () => {
    const now = new Date();
    const plan = await PaymentPlan.create({
      schoolId,
      studentId: 'STU001',
      totalAmount: 1000,
      installments: [
        { amount: 500, dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), paid: true, paidAmount: 500, paidAt: now },
        { amount: 500, dueDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
      ],
    });

    expect(plan.totalPaid).toBe(500);
  });

  test('should calculate remainingBalance virtual correctly', async () => {
    const now = new Date();
    const plan = await PaymentPlan.create({
      schoolId,
      studentId: 'STU001',
      totalAmount: 1000,
      installments: [
        { amount: 500, dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), paid: true, paidAmount: 500, paidAt: now },
        { amount: 500, dueDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
      ],
    });

    expect(plan.remainingBalance).toBe(500);
  });

  test('should calculate completedInstallments virtual correctly', async () => {
    const now = new Date();
    const plan = await PaymentPlan.create({
      schoolId,
      studentId: 'STU001',
      totalAmount: 1000,
      installments: [
        { amount: 500, dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), paid: true, paidAmount: 500, paidAt: now },
        { amount: 500, dueDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
      ],
    });

    expect(plan.completedInstallments).toBe(1);
  });

  test('should determine isCurrent correctly when no overdue installments', async () => {
    const now = new Date();
    const plan = await PaymentPlan.create({
      schoolId,
      studentId: 'STU001',
      totalAmount: 1000,
      installments: [
        { amount: 500, dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
        { amount: 500, dueDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
      ],
    });

    expect(plan.isCurrent).toBe(true);
  });

  test('should determine isCurrent as false when overdue installments exist', async () => {
    const now = new Date();
    const plan = await PaymentPlan.create({
      schoolId,
      studentId: 'STU001',
      totalAmount: 1000,
      installments: [
        { amount: 500, dueDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
        { amount: 500, dueDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
      ],
    });

    expect(plan.isCurrent).toBe(false);
  });

  test('should return nextDueDate virtual correctly', async () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const plan = await PaymentPlan.create({
      schoolId,
      studentId: 'STU001',
      totalAmount: 1000,
      installments: [
        { amount: 500, dueDate: futureDate, paid: false, paidAmount: 0 },
        { amount: 500, dueDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
      ],
    });

    expect(plan.nextDueDate).toEqual(futureDate);
  });

  test('should require at least one installment', async () => {
    try {
      await PaymentPlan.create({
        schoolId,
        studentId: 'STU001',
        totalAmount: 1000,
        installments: [],
      });
      fail('Should have thrown validation error');
    } catch (err) {
      expect(err.message).toContain('At least one installment is required');
    }
  });

  test('should track payment status per installment', async () => {
    const now = new Date();
    const plan = await PaymentPlan.create({
      schoolId,
      studentId: 'STU001',
      totalAmount: 1000,
      installments: [
        { amount: 500, dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
        { amount: 500, dueDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
      ],
    });

    plan.installments[0].paid = true;
    plan.installments[0].paidAmount = 500;
    plan.installments[0].paidAt = now;
    await plan.save();

    const updated = await PaymentPlan.findById(plan._id);
    expect(updated.installments[0].paid).toBe(true);
    expect(updated.installments[0].paidAmount).toBe(500);
    expect(updated.installments[1].paid).toBe(false);
  });

  test('should support soft delete', async () => {
    const now = new Date();
    const plan = await PaymentPlan.create({
      schoolId,
      studentId: 'STU001',
      totalAmount: 1000,
      installments: [
        { amount: 500, dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), paid: false, paidAmount: 0 },
      ],
    });

    plan.deletedAt = new Date();
    await plan.save();

    const deleted = await PaymentPlan.findById(plan._id);
    expect(deleted.deletedAt).not.toBeNull();
  });
});
