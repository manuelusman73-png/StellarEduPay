const request = require('supertest');
const app = require('../backend/src/app');

jest.mock('../backend/src/models/studentModel', () => ({
  create: jest.fn().mockResolvedValue({ studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }),
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
  findOne: jest.fn().mockResolvedValue({ studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false }),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
}));

jest.mock('../backend/src/models/paymentModel', () => ({
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
  findOne: jest.fn().mockResolvedValue(null),
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
      const fee = mockFees.find(f => f.className === className);
      return Promise.resolve(fee || null);
    }),
    findOneAndUpdate: jest.fn().mockImplementation((query, update, opts) => {
      return Promise.resolve({ className: query.className, ...update });
    }),
  };
});

jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(true),
  Schema: class {
    constructor() { this.index = jest.fn(); }
  },
  model: jest.fn().mockReturnValue({}),
}));

jest.mock('../backend/src/services/stellarService', () => ({
  syncPayments: jest.fn().mockResolvedValue(),
  verifyTransaction: jest.fn().mockResolvedValue({
    hash: 'abc123', memo: 'STU001', amount: 200, feeAmount: 200,
    feeValidation: { status: 'valid', message: 'Payment matches the required fee' },
    date: new Date().toISOString(),
  }),
}));

describe('Payment API', () => {
  test('GET /api/payments/instructions/:studentId returns wallet info with accepted assets', async () => {
    const res = await request(app).get('/api/payments/instructions/STU001');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('memo', 'STU001');
    expect(res.body).toHaveProperty('acceptedAssets');
    expect(Array.isArray(res.body.acceptedAssets)).toBe(true);
    expect(res.body.acceptedAssets.length).toBeGreaterThanOrEqual(1);
    expect(res.body.acceptedAssets.some(a => a.code === 'XLM')).toBe(true);
  });

  test('POST /api/payments/verify returns transaction with fee validation', async () => {
    const res = await request(app).post('/api/payments/verify').send({ txHash: 'abc123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hash', 'abc123');
    expect(res.body).toHaveProperty('feeAmount', 200);
    expect(res.body.feeValidation).toHaveProperty('status', 'valid');
  });

  test('POST /api/payments/sync returns success message', async () => {
    const res = await request(app).post('/api/payments/sync');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Sync complete');
  });

  test('GET /api/students/:studentId returns student with feeAmount', async () => {
    const res = await request(app).get('/api/students/STU001');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('studentId', 'STU001');
    expect(res.body).toHaveProperty('feeAmount', 200);
  });
});

describe('Fee Structure API', () => {
  test('POST /api/fees creates a fee structure', async () => {
    const res = await request(app).post('/api/fees').send({
      className: '5A', feeAmount: 200, description: 'Class 5A fees',
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('className', '5A');
    expect(res.body).toHaveProperty('feeAmount', 200);
  });

  test('GET /api/fees returns all fee structures', async () => {
    const res = await request(app).get('/api/fees');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/fees/:className returns fee for a specific class', async () => {
    const res = await request(app).get('/api/fees/5A');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('className', '5A');
    expect(res.body).toHaveProperty('feeAmount', 200);
  });

  test('GET /api/fees/:className returns 404 for unknown class', async () => {
    const res = await request(app).get('/api/fees/UNKNOWN');
    expect(res.status).toBe(404);
  });

  test('POST /api/fees rejects missing required fields', async () => {
    const res = await request(app).post('/api/fees').send({ description: 'No class' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /api/payments/accepted-assets returns list of accepted assets', async () => {
    const res = await request(app).get('/api/payments/accepted-assets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('assets');
    expect(res.body.assets.some(a => a.code === 'XLM')).toBe(true);
    expect(res.body.assets.some(a => a.code === 'USDC')).toBe(true);
  });
});
