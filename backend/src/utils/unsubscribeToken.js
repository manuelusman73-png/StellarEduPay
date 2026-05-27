'use strict';

const crypto = require('crypto');

const TOKEN_EXPIRY_DAYS = 90;

/**
 * Generate a signed unsubscribe token for a student.
 * Token format: base64(timestamp:signature)
 * Signature covers: studentId:schoolId:timestamp
 * 
 * @param {string} studentId
 * @param {string} schoolId
 * @param {string} secret - JWT_SECRET or similar
 * @returns {string} Signed token
 */
function generateUnsubscribeToken(studentId, schoolId, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${studentId}:${schoolId}:${timestamp}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
  const token = `${timestamp}.${signature}.${Buffer.from(studentId).toString('base64')}.${Buffer.from(schoolId).toString('base64')}`;
  return token;
}

/**
 * Verify and decode an unsubscribe token.
 * Returns { valid: true, studentId, schoolId } or { valid: false, error }
 * 
 * @param {string} token
 * @param {string} secret
 * @returns {object}
 */
function verifyUnsubscribeToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 4) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [timestampStr, signature, studentIdB64, schoolIdB64] = parts;
    const timestamp = parseInt(timestampStr, 10);

    if (!Number.isFinite(timestamp)) {
      return { valid: false, error: 'Invalid timestamp' };
    }

    // Check expiry (90 days)
    const now = Math.floor(Date.now() / 1000);
    const expirySeconds = TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
    if (now - timestamp > expirySeconds) {
      return { valid: false, error: 'Token expired' };
    }

    const studentId = Buffer.from(studentIdB64, 'base64').toString('utf8');
    const schoolId = Buffer.from(schoolIdB64, 'base64').toString('utf8');

    const data = `${studentId}:${schoolId}:${timestamp}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true, studentId, schoolId };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

module.exports = { generateUnsubscribeToken, verifyUnsubscribeToken };
