'use strict';

/**
 * Tests for the class-change fee structure validation in updateStudent.
 *
 * Covers:
 *   1. Class update with an active fee structure — succeeds and syncs feeAmount.
 *   2. Class update with no fee structure — returns 400 with code NO_FEE_STRUCTURE.
 *   3. Class update with explicit feeAmount override — skips fee structure lookup.
 *   4. Name-only update — no fee structure lookup performed.
 */

jest.mock('../backend/src/models/studentModel');
jest.mock('../backend/src/models/feeStructureModel', () => ({ findOne: jest.fn() }));
jest.mock('../backend/src/services/auditService', () => ({ logAudit: jest.fn() }));
jest.mock('csv-parser', () => jest.fn());
jest.mock('../backend/src/cache', () => ({
  get: jest.fn().mockReturnValue(undefined),
  set: jest.fn(),
  del: jest.fn(),
  KEYS: { student: (id) => `student:${id}`, studentsAll: () => 'students:all' },
  TTL: { STUDENT: 60 },
}));

const Student       = require('../backend/src/models/studentModel');
const FeeStructure  = require('../backend/src/models/feeStructureModel');
const { updateStudent } = require('../backend/src/controllers/studentController');

const ORIGINAL = {
  studentId: 'STU001',
  name: 'Alice',
  class: '5A',
  feeAmount: 200,
  schoolId: 'SCH-001',
};

function makeReq(params, body) {
  return { params, body, schoolId: 'SCH-001', auditContext: null };
}

function makeRes() {
  const res = {};
  res.json   = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

// ── 1. Class update with active fee structure ─────────────────────────────────

test('updates class and syncs feeAmount from fee structure', async () => {
  Student.findOne.mockReturnValue({ lean: () => Promise.resolve(ORIGINAL) });
  FeeStructure.findOne.mockResolvedValue({ feeAmount: 300 });
  const updated = { ...ORIGINAL, class: '6B', feeAmount: 300 };
  Student.findOneAndUpdate.mockResolvedValue(updated);

  const req  = makeReq({ studentId: 'STU001' }, { class: '6B' });
  const res  = makeRes();
  const next = jest.fn();

  await updateStudent(req, res, next);

  expect(FeeStructure.findOne).toHaveBeenCalledWith({ schoolId: 'SCH-001', className: '6B', isActive: true });
  expect(Student.findOneAndUpdate).toHaveBeenCalledWith(
    { schoolId: 'SCH-001', studentId: 'STU001' },
    expect.objectContaining({ class: '6B', feeAmount: 300 }),
    expect.any(Object),
  );
  expect(res.json).toHaveBeenCalledWith(updated);
  expect(next).not.toHaveBeenCalled();
});

// ── 2. Class update with no fee structure ─────────────────────────────────────

test('returns 400 NO_FEE_STRUCTURE when new class has no active fee structure', async () => {
  Student.findOne.mockReturnValue({ lean: () => Promise.resolve(ORIGINAL) });
  FeeStructure.findOne.mockResolvedValue(null);

  const req  = makeReq({ studentId: 'STU001' }, { class: 'NoFeeClass' });
  const res  = makeRes();
  const next = jest.fn();

  await updateStudent(req, res, next);

  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'NO_FEE_STRUCTURE', status: 400 }),
  );
  expect(Student.findOneAndUpdate).not.toHaveBeenCalled();
});

// ── 3. Class update with explicit feeAmount override ─────────────────────────

test('skips fee structure lookup when feeAmount is explicitly provided', async () => {
  Student.findOne.mockReturnValue({ lean: () => Promise.resolve(ORIGINAL) });
  const updated = { ...ORIGINAL, class: '6B', feeAmount: 999 };
  Student.findOneAndUpdate.mockResolvedValue(updated);

  const req  = makeReq({ studentId: 'STU001' }, { class: '6B', feeAmount: 999 });
  const res  = makeRes();
  const next = jest.fn();

  await updateStudent(req, res, next);

  expect(FeeStructure.findOne).not.toHaveBeenCalled();
  expect(Student.findOneAndUpdate).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ class: '6B', feeAmount: 999 }),
    expect.any(Object),
  );
});

// ── 4. Name-only update — no fee structure lookup ─────────────────────────────

test('does not look up fee structure when class is not being changed', async () => {
  Student.findOne.mockReturnValue({ lean: () => Promise.resolve(ORIGINAL) });
  const updated = { ...ORIGINAL, name: 'Alicia' };
  Student.findOneAndUpdate.mockResolvedValue(updated);

  const req  = makeReq({ studentId: 'STU001' }, { name: 'Alicia' });
  const res  = makeRes();
  const next = jest.fn();

  await updateStudent(req, res, next);

  expect(FeeStructure.findOne).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(updated);
});
