const request = require('supertest');
const app = require('../backend/src/app');

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockStudent = { studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false };
const mockFee = { className: '5A', feeAmount: 200, description: 'Class 5A fees', academicYear: '2026', isActive: true };

jest.mock('../backend/src/models/studentModel', () => ({
  create: jest.fn().mockResolvedValue({ studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }),
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([{ studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }]) }),
  findOne: jest.fn().mockResolvedValue({ studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/paymentModel', () => ({
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([{ studentId: 'STU001', txHash: 'abc123', amount: 200 }]) }),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/feeStructureModel', () => ({
  create: jest.fn().mockResolvedValue({ className: '5A', feeAmount: 200, description: 'Class 5A fees', academicYear: '2026', isActive: true }),
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([
jest.mock('../backend/src/models/paymentIntentModel', () => ({
  create: jest.fn().mockResolvedValue({ studentId: 'STU001', amount: 200, memo: 'ABCD123', status: 'pending' }),
  findOne: jest.fn().mockResolvedValue({ studentId: 'STU001', amount: 200, memo: 'ABCD123', status: 'pending' }),
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/feeStructureModel', () => {
  const mockFees = [
    { className: '5A', feeAmount: 200, description: 'Class 5A fees', academicYear: '2026', isActive: true },
    { className: '6B', feeAmount: 300, description: 'Class 6B fees', academicYear: '2026', isActive: true },
  ]) }),
  findOne: jest.fn().mockImplementation(({ className }) => {
    const fees = { '5A': { className: '5A', feeAmount: 200, isActive: true }, '6B': { className: '6B', feeAmount: 300, isActive: true } };
    return Promise.resolve(fees[className] || null);
  }),
  findOneAndUpdate: jest.fn().mockImplementation((query, update) =>
    Promise.resolve({ className: query.className, ...update })
  ),
}));

jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(true),
  Schema: class { constructor() { this.index = jest.fn(); } },
  model: jest.fn().mockReturnValue({}),
}));

jest.mock('../backend/src/services/stellarService', () => ({
  syncPayments: jest.fn().mockResolvedValue(),
  verifyTransaction: jest.fn().mockResolvedValue({
    hash: 'abc123',
    memo: 'STU001',
    amount: 200,
    feeAmount: 200,
    hash: 'abc123', memo: 'ABCD123', amount: 200, expectedAmount: 200,
    feeValidation: { status: 'valid', message: 'Payment matches the required fee' },
    date: new Date().toISOString(),
  }),
  recordPayment: jest.fn().mockResolvedValue({}),
}));

// ─── Full Payment Flow ────────────────────────────────────────────────────────

describe('Full payment flow', () => {
  test('Step 1 — register student', async () => {
    const res = await request(app).post('/api/students').send({
      studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ studentId: 'STU001', feeAmount: 200 });
  });

  test('Step 2 — get payment instructions', async () => {
    const res = await request(app).get('/api/payments/instructions/STU001');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('memo', 'STU001');
    expect(res.body).toHaveProperty('note');
    expect(res.body.acceptedAssets.some(a => a.code === 'XLM')).toBe(true);
  });

  test('Step 3 — verify transaction after payment', async () => {
    const res = await request(app).post('/api/payments/verify').send({ txHash: 'abc123' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hash: 'abc123', memo: 'STU001', amount: 200 });
    expect(res.body.feeValidation.status).toBe('valid');
  });

  test('Step 4 — payment history reflects the transaction', async () => {
    const res = await request(app).get('/api/payments/STU001');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('txHash', 'abc123');
  });
});

// ─── Student API ──────────────────────────────────────────────────────────────

describe('Student API', () => {
  test('POST /api/students — creates a student', async () => {
    const res = await request(app).post('/api/students').send({
      studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('studentId', 'STU001');
  });

  test('GET /api/students — returns all students', async () => {
    const res = await request(app).get('/api/students');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/students/:studentId — returns a student', async () => {
    const res = await request(app).get('/api/students/STU001');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ studentId: 'STU001', feeAmount: 200 });
  });

  test('GET /api/students/:studentId — 404 for unknown student', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/students/UNKNOWN');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('hash', 'abc123');
    expect(res.body).toHaveProperty('expectedAmount', 200);
    expect(res.body.feeValidation).toHaveProperty('status', 'valid');
  });
});

// ─── Payment API ──────────────────────────────────────────────────────────────

  test('POST /api/payments/verify records payment with confirmed status', async () => {
    const { recordPayment } = require('../backend/src/services/stellarService');
    await request(app).post('/api/payments/verify').send({ txHash: 'abc123' });
    expect(recordPayment).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }));
  });

  test('POST /api/payments/verify returns 409 for duplicate transaction', async () => {
    const Payment = require('../backend/src/models/paymentModel');
    Payment.findOne.mockResolvedValueOnce({ txHash: 'abc123' });
    const res = await request(app).post('/api/payments/verify').send({ txHash: 'abc123' });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('code', 'DUPLICATE_TX');
  });

describe('Payment API', () => {
  test('POST /api/payments/sync — returns success', async () => {
    const res = await request(app).post('/api/payments/sync');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Sync complete');
  });

  test('POST /api/payments/verify — 404 when transaction not found', async () => {
    const { verifyTransaction } = require('../backend/src/services/stellarService');
    verifyTransaction.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/payments/verify').send({ txHash: 'bad_hash' });
    expect(res.status).toBe(404);
  });

  test('GET /api/payments/accepted-assets — returns XLM and USDC', async () => {
    const res = await request(app).get('/api/payments/accepted-assets');
    expect(res.status).toBe(200);
    expect(res.body.assets.map(a => a.code)).toEqual(expect.arrayContaining(['XLM', 'USDC']));
  });
});

// ─── Fee Structure API ────────────────────────────────────────────────────────

describe('Fee Structure API', () => {
  test('POST /api/fees — creates a fee structure', async () => {
    const res = await request(app).post('/api/fees').send({ className: '5A', feeAmount: 200 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ className: '5A', feeAmount: 200 });
  });

  test('POST /api/fees — 400 when required fields missing', async () => {
    const res = await request(app).post('/api/fees').send({ description: 'No class' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  });

  test('POST /api/fees — 400 when required fields missing', async () => {
    const res = await request(app).post('/api/fees').send({ description: 'No class' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /api/fees — returns all fee structures', async () => {
    const res = await request(app).get('/api/fees');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/fees/:className — returns fee for class', async () => {
    const res = await request(app).get('/api/fees/5A');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ className: '5A', feeAmount: 200 });
  });

  test('GET /api/fees/:className — 404 for unknown class', async () => {
    const res = await request(app).get('/api/fees/UNKNOWN');
    expect(res.status).toBe(404);
  });
});

describe('Payment Intent API', () => {
  test('POST /api/payments/intent creates a payment intent', async () => {
    const res = await request(app).post('/api/payments/intent').send({ studentId: 'STU001' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('memo');
    expect(res.body).toHaveProperty('amount', 200);
    expect(res.body).toHaveProperty('studentId', 'STU001');
  });

  test('POST /api/payments/intent returns 404 for unknown student', async () => {
    const studentModel = require('../backend/src/models/studentModel');
    studentModel.findOne.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/payments/intent').send({ studentId: 'UNKNOWN' });
    expect(res.status).toBe(404);
  });
});
