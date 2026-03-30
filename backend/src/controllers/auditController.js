'use strict';

const { getAuditLogs, getRecentAuditLogs } = require('../services/auditService');

/**
 * GET /api/audit-logs
 *
 * Query parameters:
 *   - action: filter by action type
 *   - targetType: filter by target type (student, payment, fee, school)
 *   - performedBy: filter by admin user
 *   - startDate: filter by date range (ISO 8601)
 *   - endDate: filter by date range (ISO 8601)
 *   - page: page number (default: 1)
 *   - limit: results per page (default: 50, max: 200)
 */
async function getAuditLogsEndpoint(req, res, next) {
  try {
    const { schoolId } = req;
    const { action, targetType, performedBy, startDate, endDate, page, limit } = req.query;

    const result = await getAuditLogs({
      schoolId,
      action,
      targetType,
      performedBy,
      startDate,
      endDate,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/audit-logs/recent
 *
 * Returns the most recent audit logs for dashboard display.
 *
 * Query parameters:
 *   - limit: number of recent logs (default: 10, max: 50)
 */
async function getRecentAuditLogsEndpoint(req, res, next) {
  try {
    const { schoolId } = req;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const logs = await getRecentAuditLogs(schoolId, limit);
    res.json(logs);
  } catch (err) {
    next(err);
  }
}

module.exports = { getAuditLogsEndpoint, getRecentAuditLogsEndpoint };
