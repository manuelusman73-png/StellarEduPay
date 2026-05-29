'use strict';

const { validateStudentIdParam } = require('../src/middleware/validate');

function runMiddleware(studentId) {
  const req = { params: { studentId } };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();
  validateStudentIdParam(req, res, next);
  return { req, res, next };
}

describe('validateStudentIdParam — NoSQL injection prevention', () => {
  describe('rejects MongoDB operator injection attempts', () => {
    test.each([
      ['{ "$gt": "" }'],
      ['$gt'],
      ['{ "$regex": ".*" }'],
      ['{ "$ne": null }'],
      ['["$in",""]'],
    ])('rejects %s', (id) => {
      const { res, next } = runMiddleware(id);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('rejects non-string injection via type coercion guard', () => {
    test('rejects object param (query-string object deserialization)', () => {
      // Simulates what qs would produce for ?studentId[$gt]=
      const { res, next } = runMiddleware({ $gt: '' });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects array param', () => {
      const { res, next } = runMiddleware(['STU001']);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects null', () => {
      const { res, next } = runMiddleware(null);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects undefined', () => {
      const { res, next } = runMiddleware(undefined);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('rejects out-of-range lengths', () => {
    test('rejects empty string', () => {
      const { res, next } = runMiddleware('');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects string longer than 28 characters', () => {
      const { res, next } = runMiddleware('A'.repeat(29));
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('accepts valid studentId values', () => {
    test.each([
      ['STU001'],
      ['stu-001'],
      ['student_id_01'],
      ['A'.repeat(28)],
      ['a'],
    ])('accepts %s', (id) => {
      const { res, next } = runMiddleware(id);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('response format', () => {
    test('returns code VALIDATION_ERROR on rejection', () => {
      const { res } = runMiddleware('$injection');
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid studentId format',
        code: 'VALIDATION_ERROR',
      });
    });
  });
});
