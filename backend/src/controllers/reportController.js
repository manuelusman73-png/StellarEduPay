'use strict';

const { generateReport, reportToCsv, getDashboardMetrics } = require('../services/reportService');
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

    // Strict ISO 8601: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss[.sss]Z
    const ISO_8601 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/;

    if (startDate && (!ISO_8601.test(startDate) || isNaN(Date.parse(startDate)))) {
      const err = new Error('Invalid startDate — must be ISO 8601 (e.g. 2026-01-01 or 2026-01-01T00:00:00Z)');
      err.code = 'INVALID_DATE_FORMAT';
      return next(err);
    }
    if (endDate && (!ISO_8601.test(endDate) || isNaN(Date.parse(endDate)))) {
      const err = new Error('Invalid endDate — must be ISO 8601 (e.g. 2026-12-31 or 2026-12-31T23:59:59Z)');
      err.code = 'INVALID_DATE_FORMAT';
      return next(err);
    }
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      const err = new Error('startDate must be before or equal to endDate');
      err.code = 'INVALID_DATE_FORMAT';
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

/**
 * GET /api/reports/dashboard
 * Returns aggregated metrics for the frontend dashboard.
 */
async function getDashboard(req, res, next) {
  try {
    const cacheKey = `dashboard:${req.schoolId}`;
    let metrics = get(cacheKey);
    if (metrics === undefined) {
      metrics = await getDashboardMetrics({ schoolId: req.schoolId });
      set(cacheKey, metrics, TTL.REPORT);
    }
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}

module.exports = { getReport, getDashboard };
