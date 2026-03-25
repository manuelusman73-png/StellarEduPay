'use strict';

const { generateReport, reportToCsv } = require('../services/reportService');
const { get, set, KEYS, TTL } = require('../cache');

/**
 * GET /api/reports
 * Query params: startDate, endDate, format (json|csv)
 *
 * Returns a payment summary report scoped to the current school.
 */
async function getReport(req, res, next) {
  try {
    const { startDate, endDate, format = 'json' } = req.query;

    if (startDate && isNaN(Date.parse(startDate))) {
      const err = new Error('Invalid startDate — must be a valid ISO date string (e.g. 2026-01-01)');
      err.code = 'VALIDATION_ERROR';
      return next(err);
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      const err = new Error('Invalid endDate — must be a valid ISO date string (e.g. 2026-12-31)');
      err.code = 'VALIDATION_ERROR';
      return next(err);
    }
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      const err = new Error('startDate must be before or equal to endDate');
      err.code = 'VALIDATION_ERROR';
      return next(err);
    }

    const cacheKey = KEYS.report(startDate, endDate);
    let report = get(cacheKey);
    if (report === undefined) {
      report = await generateReport({ schoolId: req.schoolId, startDate, endDate });
      set(cacheKey, report, TTL.REPORT);
    }

    if (format === 'csv') {
      const csv = reportToCsv(report);
      const filename = buildFilename(startDate, endDate);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    }

    res.json(report);
  } catch (err) {
    next(err);
  }
}

function buildFilename(startDate, endDate) {
  const parts = ['school-payment-report'];
  if (startDate) parts.push(startDate);
  if (endDate) parts.push(endDate);
  return `${parts.join('_')}.csv`;
}

module.exports = { getReport };
