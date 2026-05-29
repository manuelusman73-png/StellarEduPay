'use strict';

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger').child('AuthMiddleware');
const { logAudit } = require('../services/auditService');
const { get, set } = require('../cache');
const { sendAdminAlert } = require('../services/alertService');

/**
 * requireAdminAuth — JWT-based authentication middleware for admin endpoints.
 *
 * Expects: Authorization: Bearer <token>
 *
 * The token must be signed with JWT_SECRET and carry { role: 'admin' }.
 *
 * On success: attaches req.admin (decoded payload) and calls next().
 * On failure: 401 (missing/invalid token) or 403 (insufficient role).
 */
async function requireAdminAuth(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const blockKey = `blocked_ip:${ip}`;
  
  if (get(blockKey)) {
    return res.status(429).json({
      error: 'Too many requests, IP temporarily blocked.',
      code: 'IP_BLOCKED',
    });
  }

  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  const handleAuthFailure = async (reason, code) => {
    logger.warn(`Failed admin auth attempt: ${reason} from ${ip}`, { 
      endpoint: req.originalUrl, 
      code 
    });

    // Use X-School-ID if available, else 'system'
    const schoolId = req.headers['x-school-id'] || 'system';

    await logAudit({
        schoolId,
        action: 'auth_failure',
        performedBy: 'anonymous', 
        targetId: 'admin_auth',
        targetType: 'school',
        details: { ip, endpoint: req.originalUrl, code, reason },
        result: 'failure',
        errorMessage: reason,
        ipAddress: ip,
        userAgent: req.get('user-agent'),
    });

    const failKey = `fail_count:${ip}`;
    const failCount = (get(failKey) || 0) + 1;
    set(failKey, failCount, 300); // 5 mins

    if (failCount >= 5) {
        set(blockKey, true, 900); // 15 mins
        await sendAdminAlert(`IP ${ip} blocked due to repeated auth failures`, { ip, endpoint: req.originalUrl });
    }

    return res.status(401).json({ error: reason, code });
  };

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return handleAuthFailure('Authentication required. Provide a Bearer token.', 'MISSING_AUTH_TOKEN');
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // Fail closed — if the secret is not configured, deny all access.
      return res.status(500).json({
        error: 'Server misconfiguration: JWT_SECRET is not set.',
        code: 'AUTH_MISCONFIGURED',
      });
    }

    const decoded = jwt.verify(token, secret);

    if (decoded.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden. Admin role required.',
        code: 'INSUFFICIENT_ROLE',
      });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return handleAuthFailure('Token has expired.', 'TOKEN_EXPIRED');
    }
    return handleAuthFailure('Invalid token.', 'INVALID_AUTH_TOKEN');
  }
}

module.exports = { requireAdminAuth };
