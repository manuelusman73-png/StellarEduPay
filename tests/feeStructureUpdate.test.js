'use strict';

/**
 * Tests for PUT /api/fees/:className with cascadeToStudents — issue #454
 */

const { updateFeeStructure } = require('../backend/src/controllers/feeController');

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../backend/src/models/feeStructureModel');
jest.mock('../backend/src/models/studentModel');
jest.mock('../backend/src/cache', () => ({
  get: jest.fn().mockReturnValue(undefined),
  set: jest.fn(),
  del: jest.fn(),
  KEYS: {
    feesAll: jest.fn().mockReturnValue('fees:all'),
    feeByClass: jest.fn((c) => `fees:class:${c}`),
  },
  TTL: { FEES: 300 },
}));
jest.mock('../backend/src/services/auditService', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

const FeeStructure = require('../backend/src/models/feeStructureModel');
const Student = require('../backend/src/models/studentModel');
const { logAudit } = require('../backend/src/services/auditService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(body = {}, params = {}) {
  return {
    schoolId: 'SCH-TEST',
    params: { className: 'Grade 5A', ...params },
    body,
    auditContext: { performedBy: 'admin@test.com', ipAddress: '127.0.0.1', userAgent: 'jest' },
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockFee = {
  _id: 'fee-id-1',
  schoolId: 'SCH-TEST',
  className: 'Grade 5A',
  feeAmount: 300,
  description: 'Updated fee',
  academicYear: '2026',
  isActive: true,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PUT /api/fees/:className — issue #454', () => {
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('400 when feeAmount is missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await updateFeeStructure(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('404 when fee structure not found', async () => {
    FeeStructure.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    const req = mockReq({ feeAmount: 300 });
    const res = mockRes();
    await updateFeeStructure(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('200 updates fee without cascade', async () => {
    FeeStructure.findOneAndUpdate = jest.fn().mockResolvedValue(mockFee);
    const req = mockReq({ feeAmount: 300, description: 'Updated fee', academicYear: '2026' });
    const res = mockRes();
    await updateFeeStructure(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ fee: mockFee, studentsUpdated: 0 });
    expect(Student.updateMany).not.toHaveBeenCalled();
  });

  it('200 updates fee with cascadeToStudents: true', async () => {
    FeeStructure.findOneAndUpdate = jest.fn().mockResolvedValue(mockFee);
    Student.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 5 });
    const req = mockReq({ feeAmount: 300, cascadeToStudents: true });
    const res = mockRes();
    await updateFeeStructure(req, res, next);
    expect(Student.updateMany).toHaveBeenCalledWith(
      { schoolId: 'SCH-TEST', class: 'Grade 5A', deletedAt: null },
      { feeAmount: 300, remainingBalance: null }
    );
    expect(res.json).toHaveBeenCalledWith({ fee: mockFee, studentsUpdated: 5 });
  });

  it('cascadeToStudents: false does not update students', async () => {
    FeeStructure.findOneAndUpdate = jest.fn().mockResolvedValue(mockFee);
    const req = mockReq({ feeAmount: 300, cascadeToStudents: false });
    const res = mockRes();
    await updateFeeStructure(req, res, next);
    expect(Student.updateMany).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ fee: mockFee, studentsUpdated: 0 });
  });

  it('creates audit log entry on update', async () => {
    FeeStructure.findOneAndUpdate = jest.fn().mockResolvedValue(mockFee);
    const req = mockReq({ feeAmount: 300 });
    const res = mockRes();
    await updateFeeStructure(req, res, next);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'fee_update',
      targetType: 'fee',
      targetId: 'Grade 5A',
      result: 'success',
    }));
  });

  it('includes academicYear in update when provided', async () => {
    FeeStructure.findOneAndUpdate = jest.fn().mockResolvedValue(mockFee);
    const req = mockReq({ feeAmount: 300, academicYear: '2027' });
    const res = mockRes();
    await updateFeeStructure(req, res, next);
    expect(FeeStructure.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ academicYear: '2027' }),
      expect.any(Object)
    );
  });

  it('audit log includes studentsUpdated count', async () => {
    FeeStructure.findOneAndUpdate = jest.fn().mockResolvedValue(mockFee);
    Student.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 3 });
    const req = mockReq({ feeAmount: 300, cascadeToStudents: true });
    const res = mockRes();
    await updateFeeStructure(req, res, next);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ studentsUpdated: 3, cascadeToStudents: true }),
    }));
  });
});
