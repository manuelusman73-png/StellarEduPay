'use strict';

/**
 * auditContext — middleware that captures audit-relevant information from the request.
 *
 * Attaches req.auditContext with:
 *   - performedBy: admin user identifier from JWT
 *   - ipAddress: client IP
 *   - userAgent: client user agent
 *
 * Should be applied after requireAdminAuth middleware.
 */
function auditContext(req, res, next) {
  req.auditContext = {
    performedBy: req.admin?.email || req.admin?.userId || 'unknown',
    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'] || null,
  };
  next();
}

module.exports = { auditContext };
