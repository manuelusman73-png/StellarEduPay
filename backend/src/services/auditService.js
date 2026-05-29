'use strict';

const AuditLog = require('../models/auditLogModel');
const logger = require('../utils/logger');

// In-process failure counter — reset on restart (acceptable for single-process deployments)
let _auditFailureCount = 0;

/** Returns the current audit log failure count and health status. */
function getAuditHealth() {
  return {
    status: _auditFailureCount === 0 ? 'ok' : 'degraded',
    recentFailures: _auditFailureCount,
  };
}

/** Exposed for testing only. */
function _resetAuditFailureCount() {
  _auditFailureCount = 0;
}

/**
 * logAudit — creates an audit log entry for admin actions.
 *
 * @param {Object} params
 * @param {string} params.schoolId - School context
 * @param {string} params.action - Action performed (e.g., 'student_create', 'payment_reset')
 * @param {string} params.performedBy - Admin user identifier (email or userId from JWT)
 * @param {string} params.targetId - ID of the affected resource
 * @param {string} params.targetType - Type of resource ('student', 'payment', 'fee', 'school')
 * @param {Object} params.details - Additional context (before/after values, etc.)
 * @param {string} params.result - 'success' or 'failure'
 * @param {string} params.errorMessage - Error details if result is 'failure'
 * @param {string} params.ipAddress - Client IP address
 * @param {string} params.userAgent - Client user agent
 */
async function logAudit({
  schoolId,
  action,
  performedBy,
  targetId,
  targetType,
  details = {},
  result = 'success',
  errorMessage = null,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    await AuditLog.create({
      schoolId,
      action,
      performedBy,
      targetId,
      targetType,
      details,
      result,
      errorMessage,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    // Do NOT re-throw — audit failure must not break the primary operation
    _auditFailureCount += 1;
    logger.error('AUDIT_LOG_FAILURE', { err, schoolId, action });
  }
}

/**
 * getAuditLogs — retrieves audit logs with filtering and pagination.
 *
 * @param {Object} filters
 * @param {string} filters.schoolId - Required school context
 * @param {string} filters.action - Filter by action type
 * @param {string} filters.targetType - Filter by target type
 * @param {string} filters.performedBy - Filter by admin user
 * @param {Date} filters.startDate - Filter by date range (start)
 * @param {Date} filters.endDate - Filter by date range (end)
 * @param {number} filters.page - Page number (default: 1)
 * @param {number} filters.limit - Results per page (default: 50, max: 200)
 */
async function getAuditLogs(filters = {}) {
  const {
    schoolId,
    action,
    targetType,
    performedBy,
    result,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = filters;

  const query = { schoolId };

  if (action) query.action = action;
  if (targetType) query.targetType = targetType;
  if (performedBy) query.performedBy = performedBy;
  if (result) query.result = result;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const actualLimit = Math.min(limit, 200);
  const skip = (page - 1) * actualLimit;

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(actualLimit)
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  return {
    logs,
    total,
    page,
    limit: actualLimit,
    pages: Math.ceil(total / actualLimit) || 1,
  };
}

/**
 * getRecentAuditLogs — retrieves the most recent audit logs for dashboard display.
 *
 * @param {string} schoolId - School context
 * @param {number} limit - Number of recent logs to retrieve (default: 10)
 */
async function getRecentAuditLogs(schoolId, limit = 10) {
  return await AuditLog.find({ schoolId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

module.exports = { logAudit, getAuditLogs, getRecentAuditLogs, getAuditHealth, _resetAuditFailureCount };
