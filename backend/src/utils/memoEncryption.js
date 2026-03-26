'use strict';

/**
 * Optional memo encryption using AES-256-GCM.
 *
 * Enabled when MEMO_ENCRYPTION_KEY is set to a 64-char hex string (32 bytes).
 * Encrypted memos are base64url-encoded and fit within Stellar's 28-char memo
 * limit only when the student ID is short; callers should use text memos for
 * plain IDs and hash memos for encrypted payloads (Stellar hash memo = 32 bytes).
 *
 * Format (base64url of): <12-byte IV> + <ciphertext> + <16-byte auth tag>
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const hex = process.env.MEMO_ENCRYPTION_KEY;
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('[memoEncryption] MEMO_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext student ID.
 * Returns a base64url string, or the original value if encryption is disabled.
 */
function encryptMemo(plaintext) {
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, tag]).toString('base64url');
}

/**
 * Decrypt an encrypted memo back to the original student ID.
 * Returns the original value unchanged if encryption is disabled or if the
 * value does not look like an encrypted payload (graceful fallback for
 * plain-text memos recorded before encryption was enabled).
 */
function decryptMemo(value) {
  const key = getKey();
  if (!key) return value;

  let buf;
  try {
    buf = Buffer.from(value, 'base64url');
  } catch {
    return value; // not base64url — treat as plain text
  }

  // Minimum length: IV (12) + at least 1 byte ciphertext + tag (16)
  if (buf.length < IV_LENGTH + 1 + TAG_LENGTH) return value;

  try {
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(buf.length - TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Auth tag mismatch or wrong key — return as-is so the caller can handle it
    return value;
  }
}

/** Returns true when memo encryption is active. */
function isEncryptionEnabled() {
  return !!process.env.MEMO_ENCRYPTION_KEY;
}

module.exports = { encryptMemo, decryptMemo, isEncryptionEnabled };
