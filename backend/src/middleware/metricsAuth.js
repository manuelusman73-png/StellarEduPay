'use strict';

// Constant-time string comparison to prevent timing-based token enumeration.
const { timingSafeEqual } = require('crypto');

function safeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function metricsAuth(req, res, next) {
  const token = process.env.METRICS_TOKEN;
  if (!token) {
    return res.status(500).set('Content-Type', 'text/plain').send(
      '# METRICS_TOKEN is not configured — metrics endpoint is disabled.\n'
    );
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.set('WWW-Authenticate', 'Bearer realm="metrics"');
    return res.status(401).set('Content-Type', 'text/plain').send(
      '# Unauthorized: provide Authorization: Bearer <METRICS_TOKEN>\n'
    );
  }

  const provided = authHeader.slice(7);
  if (!safeCompare(provided, token)) {
    return res.status(403).set('Content-Type', 'text/plain').send(
      '# Forbidden: invalid metrics token.\n'
    );
  }

  next();
}

module.exports = { metricsAuth };
