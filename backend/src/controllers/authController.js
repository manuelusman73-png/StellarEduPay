'use strict';

const crypto = require('crypto');

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // run anyway to avoid short-circuit timing leak
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/auth/login handler.
 * Accepts { username, password }, returns { token, expiresIn } or an error response.
 * Exported separately so it can be unit-tested without Express.
 */
function handleLogin(req, res) {
  const { username, password } = req.body || {};

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return res.status(500).json({
      error: 'Server misconfiguration: ADMIN_USERNAME or ADMIN_PASSWORD is not set.',
      code: 'AUTH_MISCONFIGURED',
    });
  }

  if (
    !username ||
    !password ||
    !safeEqual(username, expectedUsername) ||
    !safeEqual(password, expectedPassword)
  ) {
    return res.status(401).json({
      error: 'Invalid credentials.',
      code: 'INVALID_CREDENTIALS',
    });
  }

  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
  const token = jwt.sign({ role: 'admin', username }, secret, { expiresIn });

  return res.json({ token, expiresIn });
}

module.exports = { handleLogin };
