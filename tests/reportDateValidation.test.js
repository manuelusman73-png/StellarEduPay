'use strict';

/**
 * Tests for GET /api/reports date-range validation (issue #389).
 *
 * Exercises the validation logic in reportController.getReport directly
 * by constructing minimal req/res/next stubs — no Express or MongoDB needed.
 */

// Mock cache so the controller never tries to hit a real store
jest.mock('../backend/src/cache', () => ({
  get: jest.fn().mockReturnValue(undefined),
  set: jest.fn(),
  KEYS: { report: jest.fn().mockReturnValue('report-key') },
  TTL: { REPORT: 60 },
}));

// Mock reportService so valid requests don't need a real DB
jest.mock('../backend/src/services/reportService', () => ({
  generateReport: jest.fn().mockResolvedValue({ summary: {}, byDate: [] }),
  reportToCsv: jest.fn().mockReturnValue('csv'),
  getDashboardMetrics: jest.fn().mockResolvedValue({}),
}));

const { getReport } = require('../backend/src/controllers/reportController');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeReq(query = {}) {
  return { query, schoolId: 'school-1' };
}

function makeRes() {
  const res = { json: jest.fn(), send: jest.fn(), setHeader: jest.fn() };
  return res;
}

/** Calls getReport and returns the error passed to next(), or null on success. */
async function callGetReport(query) {
  const req = makeReq(query);
  const res = makeRes();
  let capturedErr = null;
  const next = (err) => { capturedErr = err || null; };
  await getReport(req, res, next);
  return capturedErr;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/reports — date validation (#389)', () => {

  describe('valid inputs', () => {
    it('accepts a valid date-only range (YYYY-MM-DD)', async () => {
      const err = await callGetReport({ startDate: '2026-01-01', endDate: '2026-12-31' });
      expect(err).toBeNull();
    });

    it('accepts a valid datetime range (ISO 8601 with time)', async () => {
      const err = await callGetReport({
        startDate: '2026-01-01T00:00:00Z',
        endDate:   '2026-12-31T23:59:59Z',
      });
      expect(err).toBeNull();
    });

    it('accepts startDate equal to endDate', async () => {
      const err = await callGetReport({ startDate: '2026-06-15', endDate: '2026-06-15' });
      expect(err).toBeNull();
    });

    it('accepts request with no date params', async () => {
      const err = await callGetReport({});
      expect(err).toBeNull();
    });

    it('accepts only startDate with no endDate', async () => {
      const err = await callGetReport({ startDate: '2026-01-01' });
      expect(err).toBeNull();
    });
  });

  describe('invalid date strings', () => {
    it('rejects a plain text string as startDate', async () => {
      const err = await callGetReport({ startDate: 'not-a-date' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_DATE_FORMAT');
    });

    it('rejects a plain text string as endDate', async () => {
      const err = await callGetReport({ endDate: 'not-a-date' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_DATE_FORMAT');
    });

    it('rejects a human-readable date (non-ISO) as startDate', async () => {
      const err = await callGetReport({ startDate: 'January 1 2026' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_DATE_FORMAT');
    });

    it('rejects MM/DD/YYYY format', async () => {
      const err = await callGetReport({ startDate: '01/01/2026' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_DATE_FORMAT');
    });

    it('rejects a structurally ISO-like but calendar-invalid date (month 13)', async () => {
      const err = await callGetReport({ startDate: '2026-13-01' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_DATE_FORMAT');
    });
  });

  describe('startDate after endDate', () => {
    it('rejects when startDate is after endDate', async () => {
      const err = await callGetReport({ startDate: '2026-12-31', endDate: '2026-01-01' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_DATE_FORMAT');
    });

    it('rejects when startDate is one day after endDate', async () => {
      const err = await callGetReport({ startDate: '2026-06-02', endDate: '2026-06-01' });
      expect(err).not.toBeNull();
      expect(err.code).toBe('INVALID_DATE_FORMAT');
    });
  });
});
