'use strict';

jest.mock('../backend/src/models/feeStructureModel', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../backend/src/cache', () => ({
  get: jest.fn().mockReturnValue(undefined),
  set: jest.fn(),
  del: jest.fn(),
  KEYS: {
    feesAll: () => 'fees:all',
    feeByClass: (className) => `fees:${className}`,
  },
  TTL: { FEES: 60 },
}));

jest.mock('../backend/src/services/auditService', () => ({
  logAudit: jest.fn(),
}));

const FeeStructure = require('../backend/src/models/feeStructureModel');
const { getAllFeeStructures, getFeeByClass } = require('../backend/src/controllers/feeController');

beforeEach(() => {
  jest.clearAllMocks();
});

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe('fee structure soft-delete handling', () => {
  test('GET /api/fees excludes soft-deleted fee structures by default', async () => {
    const sort = jest.fn().mockResolvedValue([]);
    FeeStructure.find.mockReturnValue({ sort });

    const req = {
      schoolId: 'SCH-001',
      query: {},
    };
    const res = makeRes();
    const next = jest.fn();

    await getAllFeeStructures(req, res, next);

    expect(FeeStructure.find).toHaveBeenCalledWith({
      schoolId: 'SCH-001',
      deletedAt: null,
      isActive: true,
    });
    expect(sort).toHaveBeenCalledWith({ className: 1 });
    expect(res.json).toHaveBeenCalledWith([]);
    expect(next).not.toHaveBeenCalled();
  });

  test('GET /api/fees?includeDeleted=true bypasses deletedAt filtering', async () => {
    const includeDeleted = jest.fn().mockReturnThis();
    const sort = jest.fn().mockResolvedValue([]);
    FeeStructure.find.mockReturnValue({ includeDeleted, sort });

    const req = {
      schoolId: 'SCH-001',
      query: { includeDeleted: 'true' },
    };
    const res = makeRes();
    const next = jest.fn();

    await getAllFeeStructures(req, res, next);

    expect(FeeStructure.find).toHaveBeenCalledWith({
      schoolId: 'SCH-001',
      isActive: true,
    });
    expect(includeDeleted).toHaveBeenCalled();
    expect(sort).toHaveBeenCalledWith({ className: 1 });
    expect(res.json).toHaveBeenCalledWith([]);
  });

  test('GET /api/fees/:className excludes soft-deleted fee structures', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    FeeStructure.findOne.mockImplementation(() => findOne());

    const req = {
      schoolId: 'SCH-001',
      params: { className: '5A' },
    };
    const res = makeRes();
    const next = jest.fn();

    await getFeeByClass(req, res, next);

    expect(FeeStructure.findOne).toHaveBeenCalledWith({
      schoolId: 'SCH-001',
      className: '5A',
      deletedAt: null,
      isActive: true,
    });
  });

  test('FeeStructure model includes soft-delete middleware wiring', () => {
    jest.isolateModules(() => {
      jest.resetModules();
      jest.unmock('../backend/src/models/feeStructureModel');
      const RealFeeStructure = jest.requireActual('../backend/src/models/feeStructureModel');

      expect(RealFeeStructure.schema.path('deletedAt')).toBeDefined();
      const findHooks = RealFeeStructure.schema.s.hooks._pres.get('find') || [];
      expect(findHooks.some((hook) => hook.fn.name === 'excludeDeleted')).toBe(true);
      expect(typeof RealFeeStructure.schema.methods.softDelete).toBe('function');
      expect(typeof RealFeeStructure.schema.methods.restore).toBe('function');
      expect(typeof RealFeeStructure.schema.query.includeDeleted).toBe('function');
    });
  });
});
