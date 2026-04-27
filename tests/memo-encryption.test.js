'use strict';

/**
 * Tests for the memo encryption incompatibility guard (issue #552).
 *
 * Verifies that:
 *  1. The server refuses to start when MEMO_ENCRYPTION_KEY is set.
 *  2. encryptMemo output always exceeds Stellar's 28-byte MEMO_TEXT limit.
 *  3. When no key is set, encryptMemo/decryptMemo are transparent no-ops.
 */

const { encryptMemo, decryptMemo, isEncryptionEnabled } = require('../backend/src/utils/memoEncryption');

const STELLAR_MEMO_TEXT_LIMIT = 28; // bytes (UTF-8)
const VALID_KEY = 'a'.repeat(64); // 64-char hex string

afterEach(() => {
  delete process.env.MEMO_ENCRYPTION_KEY;
  jest.resetModules();
});

describe('memoEncryption — no key set', () => {
  test('encryptMemo returns plaintext unchanged', () => {
    expect(encryptMemo('STU001')).toBe('STU001');
  });

  test('decryptMemo returns value unchanged', () => {
    expect(decryptMemo('STU001')).toBe('STU001');
  });

  test('isEncryptionEnabled returns false', () => {
    expect(isEncryptionEnabled()).toBe(false);
  });
});

describe('memoEncryption — key set', () => {
  beforeEach(() => {
    process.env.MEMO_ENCRYPTION_KEY = VALID_KEY;
  });

  test('encrypted output always exceeds 28-byte MEMO_TEXT limit (shortest possible ID)', () => {
    // Even a 1-character ID produces IV(12) + ciphertext(1) + tag(16) = 29 bytes
    // base64url(29) = 40 chars — always over the 28-byte limit
    const encrypted = encryptMemo('X');
    const byteLength = Buffer.byteLength(encrypted, 'utf8');
    expect(byteLength).toBeGreaterThan(STELLAR_MEMO_TEXT_LIMIT);
  });

  test('encrypted output exceeds limit for a typical student ID', () => {
    const encrypted = encryptMemo('STU001');
    expect(Buffer.byteLength(encrypted, 'utf8')).toBeGreaterThan(STELLAR_MEMO_TEXT_LIMIT);
  });

  test('decryptMemo round-trips correctly', () => {
    const encrypted = encryptMemo('STU001');
    expect(decryptMemo(encrypted)).toBe('STU001');
  });
});

describe('config startup guard', () => {
  test('throws a clear error when MEMO_ENCRYPTION_KEY is set', () => {
    process.env.MEMO_ENCRYPTION_KEY = VALID_KEY;
    process.env.MONGO_URI = 'mongodb://localhost:27017/test'; // satisfy other required vars
    expect(() => {
      jest.isolateModules(() => {
        require('../backend/src/config/index.js');
      });
    }).toThrow(/MEMO_ENCRYPTION_KEY is set but memo encryption is not supported/);
  });

  test('does not throw when MEMO_ENCRYPTION_KEY is absent', () => {
    process.env.MONGO_URI = 'mongodb://localhost:27017/test';
    process.env.JWT_SECRET = 'test-secret';
    expect(() => {
      jest.isolateModules(() => {
        require('../backend/src/config/index.js');
      });
    }).not.toThrow();
  });
});
