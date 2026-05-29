'use strict';

const AuditLog = require('../models/auditLogModel');
const logger = require('../utils/logger');

let cleanupInterval = null;

/**
 * Starts the audit log cleanup scheduler.
 * Runs every 10 minutes to delete expired audit logs in batches of max 1000.
 */
function startAuditLogCleanupScheduler() {
  const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  const BATCH_SIZE = 1000;
  const RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '730', 10);
  const EXPIRY_DATE = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  async function cleanupExpiredLogs() {
    try {
      const result = await AuditLog.deleteMany({
        createdAt: { $lt: EXPIRY_DATE },
      }).limit(BATCH_SIZE);

      if (result.deletedCount > 0) {
        logger.info('AUDIT_LOG_CLEANUP', {
          deletedCount: result.deletedCount,
          retentionDays: RETENTION_DAYS,
          expiryDate: EXPIRY_DATE.toISOString(),
        });
      }
    } catch (err) {
      logger.error('AUDIT_LOG_CLEANUP_FAILED', {
        error: err.message,
        retentionDays: RETENTION_DAYS,
      });
    }
  }

  cleanupInterval = setInterval(cleanupExpiredLogs, CLEANUP_INTERVAL_MS);
  logger.info('Audit log cleanup scheduler started', {
    intervalMs: CLEANUP_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    retentionDays: RETENTION_DAYS,
  });
}

/**
 * Stops the audit log cleanup scheduler.
 */
function stopAuditLogCleanupScheduler() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Audit log cleanup scheduler stopped');
  }
}

module.exports = {
  startAuditLogCleanupScheduler,
  stopAuditLogCleanupScheduler,
};
