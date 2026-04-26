'use strict';

// #467 — GET /api/students always returns { students, total, page, pages }
// Tests the controller directly to avoid app-level dependency issues.

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockStudents = [
  { studentId: 'STU001', name: 'Alice', class: '5A', feeAmount: 200, feePaid: false },
  { studentId: 'STU002', name: 'Bob',   class: '5A', feeAmount: 200, feePaid: true  },
];

const mockChainable = {
  sort: jest.fn(),
  skip: jest.fn(),
  limit: jest.fn(),
};
mockChainable.sort.mockReturnValue(mockChainable);
mockChainable.skip.mockReturnValue(mockChainable);
mockChainable.limit.mockResolvedValue(mockStudents);

jest.mock('../backend/src/models/studentModel', () => ({
  find: jest.fn().mockReturnValue(mockChainable),
  findOne: jest.fn().mockResolvedValue(null),
  countDocuments: jest.fn().mockResolvedValue(2),
  create: jest.fn(),
}));

jest.mock('../backend/src/models/feeStructureModel', () => ({
  findOne: jest.fn().mockResolvedValue(null),
}));

jest.mock('../backend/src/cache', () => ({
  get: jest.fn().mockReturnValue(undefined),
  set: jest.fn(),
  del: jest.fn(),
  KEYS: { studentsAll: () => 'students:all', student: (id) => `student:${id}` },
  TTL: { STUDENT: 60 },
}));

jest.mock('../backend/src/services/auditService', () => ({
  logAudit: jest.fn().mockResolvedValue({}),
}));

jest.mock('csv-parser', () => jest.fn(), { virtual: true });

// ─── Tests ────────────────────────────────────────────────────────────────────

const { getAllStudents } = require('../backend/src/controllers/studentController');

describe('#467 GET /api/students consistent response shape', () => {
  function makeReqRes(query = {}) {
    const req = { schoolId: 'SCH1', query };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
    return { req, res, next };
  }

  it('always returns { students, total, page, pages }', async () => {
    const { req, res, next } = makeReqRes();
    await getAllStudents(req, res, next);

    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('students');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('pages');
    expect(Array.isArray(body.students)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.page).toBe('number');
    expect(typeof body.pages).toBe('number');
  });

  it('returns correct pagination values', async () => {
    const { req, res, next } = makeReqRes({ page: '1', limit: '10' });
    await getAllStudents(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.page).toBe(1);
    expect(body.total).toBe(2);
    expect(body.pages).toBe(1); // ceil(2/10) = 1
  });

  it('response is never a bare array', async () => {
    const { req, res, next } = makeReqRes();
    await getAllStudents(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body)).toBe(false);
  });

  it('students field is an array', async () => {
    const { req, res, next } = makeReqRes();
    await getAllStudents(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(Array.isArray(body.students)).toBe(true);
    expect(body.students).toHaveLength(2);
  });
});
