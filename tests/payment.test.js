'use strict';

// Must set required env vars before app is loaded (config/index.js validates on require)
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GTEST123';

const request = require('supertest');

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(true),
  Schema: class {
    constructor() { this.index = jest.fn(); }
  },
  model: jest.fn().mockReturnValue({}),
}));

jest.mock('../backend/src/models/studentModel', () => ({
  create: jest.fn().mockResolvedValue({ studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }),
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([{ studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }]) }),
  findOne: jest.fn().mockResolvedValue({ studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/paymentModel', () => ({
  find: jest.fn().mockReturnValue({ 
    sort: jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue([{ studentId: { studentId: 'STU001', name: 'Alice' }, txHash: 'abc123', amount: 200 }])
    })
  }),
  findOne: jest.fn().mockReturnValue({
    sort: jest.fn().mockResolvedValue(null)
  }),
  create: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/paymentIntentModel', () => ({
  create: jest.fn().mockResolvedValue({ studentId: 'STU001', amount: 200, memo: 'ABCD1234', status: 'pending' }),
  findOne: jest.fn().mockResolvedValue({ studentId: 'STU001', amount: 200, memo: 'ABCD1234', status: 'pending' }),
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/idempotencyKeyModel', () => ({
  findOne: jest.fn().mockResolvedValue(null), // no cached response by default
  create: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/feeStructureModel', () => {
  const mockFees = [
    { className: '5A', feeAmount: 200, description: 'Class 5A fees', academicYear: '2026', isActive: true },
    { className: '6B', feeAmount: 300, description: 'Class 6B fees', academicYear: '2026', isActive: true },
  ];
  return {
    create: jest.fn().mockResolvedValue(mockFees[0]),
    find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(mockFees) }),
    findOne: jest.fn().mockImplementation(({ className }) => {
      const fees = { '5A': mockFees[0], '6B': mockFees[1] };
      return Promise.resolve(fees[className] || null);
    }),
    findOneAndUpdate: jest.fn().mockImplementation((query, update) =>
      Promise.resolve({ className: query.className, ...update })
    ),
  };
});

jest.mock('../backend/src/services/stellarService', () => ({
  syncPayments: jest.fn().mockResolvedValue(undefined),
  verifyTransaction: jest.fn().mockResolvedValue({
    hash: 'abc123',
    memo: 'ABCD1234',
    amount: 200,
    expectedAmount: 200,
    feeValidation: { status: 'valid', message: 'Payment matches the required fee' },
    date: new Date().toISOString(),
  }),
  recordPayment: jest.fn().mockResolvedValue({}),
  finalizeConfirmedPayments: jest.fn().mockResolvedValue(undefined),
}));

const app = require('../backend/src/app');

// ─── Full Payment Flow ────────────────────────────────────────────────────────

describe('Full payment flow', () => {
  test('Step 1 — register student', async () => {
    const res = await request(app).post('/api/v1/students').send({
      studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ studentId: 'STU001', feeAmount: 200 });
  });

  test('Step 2 — get payment instructions', async () => {
    const res = await request(app).get('/api/v1/payments/instructions/STU001');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('memo', 'STU001');
    expect(res.body).toHaveProperty('note');
    expect(res.body.acceptedAssets.some(a => a.code === 'XLM')).toBe(true);
  });

  test('Step 3 — verify transaction after payment', async () => {
    const res = await request(app).post('/api/v1/payments/verify').send({ txHash: 'abc123' });
    const res = await request(app)
      .post('/api/payments/verify')
      .set('Idempotency-Key', 'flow-verify-abc123')
      .send({ txHash: 'abc123' });
    expect(res.status).toBe(200);
    expect(res.body.feeValidation.status).toBe('valid');
  });

  test('Step 4 — payment history reflects the transaction', async () => {
    const res = await request(app).get('/api/v1/payments/STU001');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('txHash', 'abc123');
  });
});

// ─── Student API ──────────────────────────────────────────────────────────────

describe('Student API', () => {
  test('POST /api/v1/students — creates a student', async () => {
    const res = await request(app).post('/api/v1/students').send({
      studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('studentId', 'STU001');
  });

  test('GET /api/v1/students — returns all students', async () => {
    const res = await request(app).get('/api/v1/students');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/v1/students/:studentId — returns a student', async () => {
    const res = await request(app).get('/api/v1/students/STU001');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ studentId: 'STU001', feeAmount: 200 });
  });

  test('GET /api/v1/students/:studentId — 404 for unknown student', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/v1/students/UNKNOWN');
    expect(res.status).toBe(404);
  });
});

// ─── Payment API ──────────────────────────────────────────────────────────────

describe('Payment API', () => {
  test('POST /api/v1/payments/sync — returns success', async () => {
    const res = await request(app).post('/api/v1/payments/sync');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Sync complete');
  });

  test('POST /api/v1/payments/verify — returns 409 for duplicate transaction', async () => {
    const Payment = require('../backend/src/models/paymentModel');
    Payment.findOne.mockResolvedValueOnce({ txHash: 'abc123' });
    const res = await request(app).post('/api/v1/payments/verify').send({ txHash: 'abc123' });
    const res = await request(app)
      .post('/api/payments/verify')
      .set('Idempotency-Key', 'test-verify-dup')
      .send({ txHash: 'abc123' });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('code', 'DUPLICATE_TX');
  });

  test('GET /api/v1/payments/accepted-assets — returns XLM and USDC', async () => {
    const res = await request(app).get('/api/v1/payments/accepted-assets');
    expect(res.status).toBe(200);
    expect(res.body.assets.map(a => a.code)).toEqual(expect.arrayContaining(['XLM', 'USDC']));
  });
});

// ─── Fee Structure API ────────────────────────────────────────────────────────

describe('Fee Structure API', () => {
  test('POST /api/v1/fees — creates a fee structure', async () => {
    const res = await request(app).post('/api/v1/fees').send({ className: '5A', feeAmount: 200 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ className: '5A', feeAmount: 200 });
  });

  test('POST /api/v1/fees — 400 when required fields missing', async () => {
    const res = await request(app).post('/api/v1/fees').send({ description: 'No class' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('GET /api/v1/fees — returns all fee structures', async () => {
    const res = await request(app).get('/api/v1/fees');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/v1/fees/:className — returns fee for class', async () => {
    const res = await request(app).get('/api/v1/fees/5A');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ className: '5A', feeAmount: 200 });
  });

  test('GET /api/v1/fees/:className — 404 for unknown class', async () => {
    const res = await request(app).get('/api/v1/fees/UNKNOWN');
    expect(res.status).toBe(404);
  });
});

// ─── Payment Intent API ───────────────────────────────────────────────────────

describe('Payment Intent API', () => {
,  test('POST /api/v1/payments/intent — creates a payment intent', async () => {
    const res = await request(app).post('/api/v1/payments/intent').send({ studentId: 'STU001' });
  test('POST /api/payments/intent — creates a payment intent', async () => {
    const res = await request(app)
      .post('/api/payments/intent')
      .set('Idempotency-Key', 'test-intent-stu001')
      .send({ studentId: 'STU001' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('memo');
    expect(res.body).toHaveProperty('amount', 200);
    expect(res.body).toHaveProperty('studentId', 'STU001');
  });

  test('POST /api/v1/payments/intent — 404 for unknown student', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/v1/payments/intent').send({ studentId: 'UNKNOWN' });
    const res = await request(app)
      .post('/api/payments/intent')
      .set('Idempotency-Key', 'test-intent-unknown')
      .send({ studentId: 'UNKNOWN' });
    expect(res.status).toBe(404);
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe('Idempotency', () => {
  let IdempotencyKey;

  beforeEach(() => {
    IdempotencyKey = require('../backend/src/models/idempotencyKeyModel');
    // Reset to default: no cached record exists
    IdempotencyKey.findOne.mockResolvedValue(null);
    IdempotencyKey.create.mockResolvedValue({});
  });

  test('POST /api/payments/intent — 400 when Idempotency-Key header is missing', async () => {
    const res = await request(app).post('/api/payments/intent').send({ studentId: 'STU001' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'MISSING_IDEMPOTENCY_KEY');
  });

  test('POST /api/payments/verify — 400 when Idempotency-Key header is missing', async () => {
    const res = await request(app).post('/api/payments/verify').send({ txHash: 'abc123' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'MISSING_IDEMPOTENCY_KEY');
  });

  test('POST /api/payments/intent — returns cached response on duplicate key', async () => {
    const cachedBody = { studentId: 'STU001', amount: 200, memo: 'CACHED1', status: 'pending' };
    IdempotencyKey.findOne.mockResolvedValueOnce({
      key: 'dupe-intent-key',
      requestPath: '/intent',
      responseStatus: 201,
      responseBody: cachedBody,
    });

    const PaymentIntent = require('../backend/src/models/paymentIntentModel');
    PaymentIntent.create.mockClear();

    const res = await request(app)
      .post('/api/payments/intent')
      .set('Idempotency-Key', 'dupe-intent-key')
      .send({ studentId: 'STU001' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(cachedBody);
    // Cached — controller should never have been reached
    expect(PaymentIntent.create).not.toHaveBeenCalled();
  });

  test('POST /api/payments/verify — returns cached response on duplicate key', async () => {
    const cachedBody = { hash: 'abc123', memo: 'STU001', amount: 200, feeValidation: { status: 'valid' } };
    IdempotencyKey.findOne.mockResolvedValueOnce({
      key: 'dupe-verify-key',
      requestPath: '/verify',
      responseStatus: 200,
      responseBody: cachedBody,
    });

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Idempotency-Key', 'dupe-verify-key')
      .send({ txHash: 'abc123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedBody);
  });

  test('POST /api/payments/intent — caches response after first successful call', async () => {
    IdempotencyKey.create.mockClear();

    await request(app)
      .post('/api/payments/intent')
      .set('Idempotency-Key', 'new-intent-key')
      .send({ studentId: 'STU001' });

    expect(IdempotencyKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'new-intent-key',
        requestPath: '/intent',
        responseStatus: 201,
      })
    );
  });

  test('POST /api/payments/sync — does NOT require Idempotency-Key', async () => {
    const res = await request(app).post('/api/payments/sync');
    expect(res.status).toBe(200);
  });
});
