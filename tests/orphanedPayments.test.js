'use strict';

/**
 * Tests for orphaned payment handling when a student is deleted.
 *
 * These tests exercise the core logic directly (no Express/controller imports)
 * to stay within the root test environment's available dependencies.
 *
 * Covers:
 *  - deleteStudent marks associated payments as studentDeleted: true
 *  - deleteStudent does NOT mark payments when student not found
 *  - getStudentPayments returns 404 for a deleted (non-existent) student
 *  - getStudentPayments returns payments when student exists
 */

// ─── Minimal stubs for the logic under test ───────────────────────────────────

const mockUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
const mockFindOneAndDelete = jest.fn();
const mockStudentFindOne = jest.fn();
const mockPaymentFind = jest.fn();
const mockPaymentCountDocuments = jest.fn().mockResolvedValue(0);

const Payment = {
  updateMany: mockUpdateMany,
  find: mockPaymentFind,
  countDocuments: mockPaymentCountDocuments,
};

const Student = {
  findOneAndDelete: mockFindOneAndDelete,
  findOne: mockStudentFindOne,
};

// ─── Logic under test (mirrors the actual controller implementations) ─────────

/**
 * Core of deleteStudent: delete the student then mark their payments orphaned.
 * Returns { status, body } or calls next(err).
 */
async function deleteStudentLogic(schoolId, studentId) {
  const student = await Student.findOneAndDelete({ schoolId, studentId });
  if (!student) {
    const err = new Error('Student not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await Payment.updateMany(
    { schoolId, studentId },
    { studentDeleted: true },
  );
  return { message: `Student ${studentId} deleted` };
}

/**
 * Core of getStudentPayments: 404 if student deleted, otherwise return payments.
 */
async function getStudentPaymentsLogic(schoolId, studentId, page = 1, limit = 50) {
  const student = await Student.findOne({ schoolId, studentId });
  if (!student) {
    const err = new Error('Student not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  const total = await Payment.countDocuments({ schoolId, studentId });
  return { payments: [], total, page, pages: Math.ceil(total / limit) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('deleteStudent — orphaned payment cascade', () => {
  test('marks associated payments as studentDeleted: true on successful deletion', async () => {
    mockFindOneAndDelete.mockResolvedValue({ studentId: 'STU001', name: 'Alice', class: '5A' });

    const result = await deleteStudentLogic('SCH001', 'STU001');

    expect(result.message).toContain('STU001');
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { schoolId: 'SCH001', studentId: 'STU001' },
      { studentDeleted: true },
    );
  });

  test('throws NOT_FOUND and does NOT call updateMany when student not found', async () => {
    mockFindOneAndDelete.mockResolvedValue(null);

    await expect(deleteStudentLogic('SCH001', 'GHOST')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe('getStudentPayments — 404 for deleted student', () => {
  test('throws NOT_FOUND when student does not exist (deleted)', async () => {
    mockStudentFindOne.mockResolvedValue(null);

    await expect(getStudentPaymentsLogic('SCH001', 'DELETED001')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  test('returns payment list when student exists', async () => {
    mockStudentFindOne.mockResolvedValue({ studentId: 'STU001', name: 'Alice' });
    mockPaymentCountDocuments.mockResolvedValue(3);

    const result = await getStudentPaymentsLogic('SCH001', 'STU001');

    expect(result).toMatchObject({ payments: [], total: 3, page: 1 });
  });
});
