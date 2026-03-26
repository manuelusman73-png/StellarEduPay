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

// A valid 24-char hex MongoDB ObjectId used wherever the DB _id is required.
// Declared as a const for use in test bodies. The literal is also inlined
// inside jest.mock() factories below because Jest hoists those calls above
// const declarations, which would make the variable undefined inside the factory.
const MOCK_STUDENT_OBJ_ID = '507f1f77bcf86cd799439011';

jest.mock('../backend/src/models/studentModel', () => ({
  create: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }),
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([{ _id: '507f1f77bcf86cd799439011', studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }]) }),
  findOne: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/paymentModel', () => ({
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ studentId: 'STU001', txHash: 'abc123', amount: 200 }]),
      populate: jest.fn().mockResolvedValue([{ studentId: { studentId: 'STU001', name: 'Alice' }, txHash: 'abc123', amount: 200 }]),
    }),
  }),
  findOne: jest.fn().mockReturnValue({
    sort: jest.fn().mockResolvedValue(null),
  }),
  create: jest.fn().mockResolvedValue({}),
  aggregate: jest.fn().mockResolvedValue([]),
  countDocuments: jest.fn().mockResolvedValue(0),
}));

jest.mock('../backend/src/models/paymentIntentModel', () => ({
  create: jest.fn().mockResolvedValue({ studentId: 'STU001', amount: 200, memo: 'ABCD1234', status: 'pending' }),
  findOne: jest.fn().mockResolvedValue({ studentId: 'STU001', amount: 200, memo: 'ABCD1234', status: 'pending' }),
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/idempotencyKeyModel', () => ({
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/config/retryQueueSetup', () => ({
  initializeRetryQueue: jest.fn(),
  setupMonitoring: jest.fn(),
}));

jest.mock('../backend/src/services/retryService', () => ({
  queueForRetry: jest.fn().mockResolvedValue(undefined),
  startRetryWorker: jest.fn(),
  stopRetryWorker: jest.fn(),
  isRetryWorkerRunning: jest.fn().mockReturnValue(false),
}));

jest.mock('../backend/src/services/transactionService', () => ({
  startPolling: jest.fn(),
  stopPolling: jest.fn(),
}));

jest.mock('../backend/src/services/consistencyScheduler', () => ({
  startConsistencyScheduler: jest.fn(),
}));

jest.mock('../backend/src/services/reminderService', () => ({
  startReminderScheduler: jest.fn(),
  stopReminderScheduler: jest.fn(),
  processReminders: jest.fn().mockResolvedValue({ schools: 0, eligible: 0, sent: 0, failed: 0, skipped: 0 }),
}));

jest.mock('../backend/src/models/schoolModel', () => ({
  findOne: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue({
      schoolId: 'SCH001',
      name: 'Test School',
      slug: 'test-school',
      stellarAddress: 'GTEST123',
      localCurrency: 'USD',
      isActive: true,
    }),
  }),
  create: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/pendingVerificationModel', () => ({
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) }),
  findOne: jest.fn().mockResolvedValue(null),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
  findByIdAndUpdate: jest.fn().mockResolvedValue({}),
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

jest.mock('../backend/src/services/currencyConversionService', () => ({
  convertToLocalCurrency: jest.fn().mockResolvedValue({
    available: true, localAmount: 100, currency: 'USD', rate: 0.5, rateTimestamp: new Date().toISOString(),
  }),
  enrichPaymentWithConversion: jest.fn().mockImplementation((p) => Promise.resolve({ ...p, localCurrency: { available: false } })),
  _getRates: jest.fn().mockResolvedValue(null),
}));

jest.mock('../backend/src/config/stellarConfig', () => ({
  SCHOOL_WALLET: 'GTEST123',
  ACCEPTED_ASSETS: {
    XLM:  { code: 'XLM',  type: 'native',          issuer: null },
    USDC: { code: 'USDC', type: 'credit_alphanum4', issuer: 'GISSUER' },
  },
  server: {
    transactions: () => ({
      transaction: (txHash) => ({
        call: async () => ({
          hash: txHash,
          successful: true,
          created_at: new Date().toISOString(),
          ledger_attr: 12345,
          memo: 'test-memo',
          fee_paid: 100,
          source_account: 'GACCOUNT',
          operation_count: 1,
        }),
      }),
    }),
  },
}));

jest.mock('../backend/src/services/stellarService', () => ({
  syncPayments: jest.fn().mockResolvedValue(undefined),
  syncPaymentsForSchool: jest.fn().mockResolvedValue(undefined),
  verifyTransaction: jest.fn().mockResolvedValue({
    hash: 'abc123',
    memo: 'STU001',
    studentId: 'STU001',
    amount: 200,
    assetCode: 'XLM',
    assetType: 'native',
    expectedAmount: 200,
    feeAmount: 200,
    feeValidation: { status: 'valid', excessAmount: 0, message: 'Payment matches the required fee' },
    networkFee: 0.00001,
    date: new Date().toISOString(),
    ledger: 100,
    senderAddress: 'GSENDER123',
  }),
  recordPayment: jest.fn().mockResolvedValue({}),
  finalizeConfirmedPayments: jest.fn().mockResolvedValue(undefined),
}));

const app = require('../backend/src/app');

// Helper: supertest wrapper that always sends the X-School-ID header
function api(app) {
  const agent = request(app);
  const wrap = (method) => (...args) => {
    const req = agent[method](...args);
    return req.set('X-School-ID', 'SCH001');
  };
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), delete: wrap('delete') };
}
const testApi = api(app);

// ─── Full Payment Flow ────────────────────────────────────────────────────────

describe('Full payment flow', () => {
  test('Step 1 — register student', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce(null); // no exact duplicate
    Student.findOne.mockResolvedValueOnce(null); // no fuzzy duplicate
    const res = await testApi.post('/api/students').send({
      studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ studentId: 'STU001', feeAmount: 200 });
  });

  test('Step 2 — get payment instructions', async () => {
    const res = await testApi.get('/api/payments/instructions/STU001');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('memo', 'STU001');
    expect(res.body).toHaveProperty('note');
    expect(res.body.acceptedAssets.some(a => a.code === 'XLM')).toBe(true);
  });

  test('Step 3 — verify transaction after payment', async () => {
    const txHash = 'a'.repeat(64);
    const res = await testApi.post('/api/payments/verify')
      .set('Idempotency-Key', 'flow-verify-abc123')
      .send({ txHash });
    expect(res.status).toBe(200);
    expect(res.body.feeValidation.status).toBe('valid');
  });

  test('Step 4 — payment history reflects the transaction', async () => {
    const res = await testApi.get('/api/payments/STU001');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('txHash', 'abc123');
  });
});

// ─── Student API ──────────────────────────────────────────────────────────────

describe('Student API', () => {
  test('POST /api/students — creates a student', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce(null); // no exact duplicate
    Student.findOne.mockResolvedValueOnce(null); // no fuzzy duplicate
    const res = await testApi.post('/api/students').send({
      studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('studentId', 'STU001');
  });

  test('GET /api/students — returns all students', async () => {
    const res = await testApi.get('/api/students');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/students/:studentId — returns a student', async () => {
    const res = await testApi.get('/api/students/STU001');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ studentId: 'STU001', feeAmount: 200 });
  });

  test('GET /api/students/:studentId — 404 for unknown student', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce(null);
    const res = await testApi.get('/api/students/UNKNOWN');
    expect(res.status).toBe(404);
  });
});

// ─── Payment API ──────────────────────────────────────────────────────────────

describe('Payment API', () => {
  test('POST /api/payments/sync — returns success', async () => {
    const res = await testApi.post('/api/payments/sync');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Sync complete');
  });

  test('POST /api/payments/verify — returns 409 for duplicate transaction', async () => {
    const Payment = require('../backend/src/models/paymentModel');
    const txHash = 'b'.repeat(64);
    Payment.findOne.mockResolvedValueOnce({ txHash });
    const res = await testApi.post('/api/payments/verify')
      .set('Idempotency-Key', 'test-verify-dup')
      .send({ txHash });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('code', 'DUPLICATE_TX');
  });

  test('GET /api/payments/accepted-assets — returns XLM and USDC', async () => {
    const res = await testApi.get('/api/payments/accepted-assets');
    expect(res.status).toBe(200);
    expect(res.body.assets.map(a => a.code)).toEqual(expect.arrayContaining(['XLM', 'USDC']));
  });
});

// ─── Fee Structure API ────────────────────────────────────────────────────────

describe('Fee Structure API', () => {
  test('POST /api/fees — creates a fee structure', async () => {
    const res = await testApi.post('/api/fees').send({ className: '5A', feeAmount: 200 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ className: '5A', feeAmount: 200 });
  });

  test('POST /api/fees — 400 when required fields missing', async () => {
    const res = await testApi.post('/api/fees').send({ description: 'No class' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  test('GET /api/fees — returns all fee structures', async () => {
    const res = await testApi.get('/api/fees');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/fees/:className — returns fee for class', async () => {
    const res = await testApi.get('/api/fees/5A');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ className: '5A', feeAmount: 200 });
  });

  test('GET /api/fees/:className — 404 for unknown class', async () => {
    const res = await testApi.get('/api/fees/UNKNOWN');
    expect(res.status).toBe(404);
  });
});

// ─── Payment Intent API ───────────────────────────────────────────────────────

describe('Payment Intent API', () => {
  test('POST /api/payments/intent — creates a payment intent', async () => {
    const res = await testApi.post('/api/payments/intent')
      .set('Idempotency-Key', 'test-intent-stu001')
      .send({ studentId: 'STU001' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('memo');
    expect(res.body).toHaveProperty('amount', 200);
    expect(res.body).toHaveProperty('studentId', 'STU001');
  });

  test('POST /api/payments/intent — 400 for invalid studentId format', async () => {
    // 'UNKNOWN' is not a 24-char hex ObjectId — Joi must reject it before the controller
    const res = await request(app).post('/api/payments/intent').send({ studentId: 'UNKNOWN' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors[0]).toHaveProperty('field', 'studentId');
  });

  test('POST /api/payments/intent — 400 for amount below minimum threshold', async () => {
    const res = await request(app).post('/api/payments/intent').send({ studentId: MOCK_STUDENT_OBJ_ID, amount: 0.5 });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toHaveProperty('field', 'amount');
  });

  test('POST /api/payments/intent — 400 for unsupported currency', async () => {
    const res = await request(app).post('/api/payments/intent').send({ studentId: MOCK_STUDENT_OBJ_ID, currency: 'BTC' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toHaveProperty('field', 'currency');
  });

  test('POST /api/payments/submit — 400 when xdr is missing', async () => {
    const res = await request(app).post('/api/payments/submit').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors[0]).toHaveProperty('field', 'xdr');
  });

  test('POST /api/v1/payments/intent — 404 for unknown student', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce(null);
    const res = await testApi.post('/api/payments/intent')
      .set('Idempotency-Key', 'test-intent-unknown')
      .send({ studentId: 'UNKNOWN' });
    expect(res.status).toBe(404);
  });
});

// ─── Duplicate Student Detection ─────────────────────────────────────────────

describe('Duplicate Student Detection', () => {
  test('POST /api/students — 409 for duplicate studentId', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce({
      studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200,
    });
    const res = await testApi.post('/api/students').send({
      studentId: 'STU001', name: 'Bob', class: '5A', feeAmount: 200,
    });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('code', 'DUPLICATE_STUDENT');
  });

  test('POST /api/students — 201 with warning for same name+class', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce(null); // no exact match
    Student.findOne.mockResolvedValueOnce({      // fuzzy match found
      studentId: 'STU001', name: 'Alice', class: '5A',
    });
    Student.create.mockResolvedValueOnce({
      studentId: 'STU002', name: 'Alice', class: '5A', feeAmount: 200,
      toObject() { return { studentId: 'STU002', name: 'Alice', class: '5A', feeAmount: 200 }; },
    });
    const res = await testApi.post('/api/students').send({
      studentId: 'STU002', name: 'Alice', class: '5A', feeAmount: 200,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('warning');
    expect(res.body.warning).toMatch(/already exists/);
  });

  test('POST /api/students — 201 without warning for unique student', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce(null); // no exact match
    Student.findOne.mockResolvedValueOnce(null); // no fuzzy match
    Student.create.mockResolvedValueOnce({
      studentId: 'STU999', name: 'Unique', class: '7A', feeAmount: 300,
    });
    const res = await testApi.post('/api/students').send({
      studentId: 'STU999', name: 'Unique', class: '7A', feeAmount: 300,
    });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('warning');
  });

  test('POST /api/students — 409 when MongoDB throws duplicate key error', async () => {
    const Student = require('../backend/src/models/studentModel');
    Student.findOne.mockResolvedValueOnce(null); // race condition: no match found
    Student.findOne.mockResolvedValueOnce(null); // no fuzzy match
    const mongoErr = new Error('E11000 duplicate key');
    mongoErr.code = 11000;
    Student.create.mockRejectedValueOnce(mongoErr);
    const res = await testApi.post('/api/students').send({
      studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200,
    });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('code', 'DUPLICATE_STUDENT');
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe('Idempotency', () => {
  let IdempotencyKey;

  beforeEach(() => {
    IdempotencyKey = require('../backend/src/models/idempotencyKeyModel');
    IdempotencyKey.findOne.mockResolvedValue(null);
    IdempotencyKey.create.mockResolvedValue({});
  });

  test('POST /api/payments/intent — 400 when Idempotency-Key header is missing', async () => {
    const res = await testApi.post('/api/payments/intent').send({ studentId: 'STU001' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'MISSING_IDEMPOTENCY_KEY');
  });

  test('POST /api/payments/verify — 400 when Idempotency-Key header is missing', async () => {
    const res = await testApi.post('/api/payments/verify').send({ txHash: 'abc123' });
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

    const res = await testApi.post('/api/payments/intent')
      .set('Idempotency-Key', 'dupe-intent-key')
      .send({ studentId: 'STU001' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(cachedBody);
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

    const res = await testApi.post('/api/payments/verify')
      .set('Idempotency-Key', 'dupe-verify-key')
      .send({ txHash: 'abc123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedBody);
  });

  test('POST /api/payments/intent — caches response after first successful call', async () => {
    IdempotencyKey.create.mockClear();

    await testApi.post('/api/payments/intent')
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
    const res = await testApi.post('/api/payments/sync');
    expect(res.status).toBe(200);
  });

  test('GET /api/payments/verify/:txHash — returns transaction details', async () => {
    const txHash = 'a'.repeat(64);
    const res = await request(app).get(`/api/payments/verify/${txHash}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      hash: txHash,
      successful: true,
      created_at: expect.any(String),
      ledger: 12345,
      memo: 'test-memo',
      fee_paid: 100,
      source_account: 'GACCOUNT',
      operations_count: 1,
    });
  });

  test('GET /api/payments/verify/:txHash — 400 for invalid txHash', async () => {
    const res = await request(app).get('/api/payments/verify/invalid');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('txHash');
  });
});
