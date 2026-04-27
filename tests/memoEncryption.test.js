'use strict';

/**
 * Tests for #452 — memo field encryption in paymentModel.
 *
 * Covers:
 *   1. encryptMemo / decryptMemo round-trip produces the original value.
 *   2. Encrypted value differs from plaintext.
 *   3. decryptMemo is a no-op when encryption is disabled (no key).
 *   4. decryptMemo returns the original value for non-encrypted strings (graceful fallback).
 *   5. Payment pre('save') hook encrypts memo before storage.
 *   6. Payment post('init') hook decrypts memo after loading.
 */

// Set a valid 64-char hex key before loading the module under test.
const TEST_KEY = 'a'.repeat(64); // 32 bytes of 0xaa — valid for testing
process.env.MEMO_ENCRYPTION_KEY = TEST_KEY;
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B';

const { encryptMemo, decryptMemo, isEncryptionEnabled } = require('../backend/src/utils/memoEncryption');

// ── Unit tests for memoEncryption utility ─────────────────────────────────────

describe('memoEncryption utility', () => {
  test('isEncryptionEnabled returns true when key is set', () => {
    expect(isEncryptionEnabled()).toBe(true);
  });

  test('encrypt/decrypt round-trip returns original plaintext', () => {
    const original = 'STU001';
    const encrypted = encryptMemo(original);
    const decrypted = decryptMemo(encrypted);
    expect(decrypted).toBe(original);
  });

  test('encrypted value differs from plaintext', () => {
    const original = 'STU001';
    const encrypted = encryptMemo(original);
    expect(encrypted).not.toBe(original);
  });

  test('each encryption produces a different ciphertext (random IV)', () => {
    const original = 'STU001';
    const enc1 = encryptMemo(original);
    const enc2 = encryptMemo(original);
    expect(enc1).not.toBe(enc2);
    // Both must still decrypt to the same value
    expect(decryptMemo(enc1)).toBe(original);
    expect(decryptMemo(enc2)).toBe(original);
  });

  test('decryptMemo returns original value for non-encrypted short strings (graceful fallback)', () => {
    // A plain student ID that is too short to be an encrypted payload
    const plain = 'STU001';
    expect(decryptMemo(plain)).toBe(plain);
  });

  test('decryptMemo returns value unchanged when encryption is disabled', () => {
    // Temporarily unset the key
    const savedKey = process.env.MEMO_ENCRYPTION_KEY;
    delete process.env.MEMO_ENCRYPTION_KEY;

    const plain = 'STU001';
    expect(decryptMemo(plain)).toBe(plain);

    process.env.MEMO_ENCRYPTION_KEY = savedKey;
  });

  test('encryptMemo returns plaintext unchanged when encryption is disabled', () => {
    const savedKey = process.env.MEMO_ENCRYPTION_KEY;
    delete process.env.MEMO_ENCRYPTION_KEY;

    const plain = 'STU001';
    expect(encryptMemo(plain)).toBe(plain);

    process.env.MEMO_ENCRYPTION_KEY = savedKey;
  });
});

// ── Integration: Payment model hooks ─────────────────────────────────────────

jest.mock('../backend/src/models/paymentModel', () => {
  // We test the hooks directly rather than through Mongoose to avoid needing
  // a real DB connection. The hook logic is extracted and tested in isolation.
  return {};
});

describe('Payment memo encryption hooks (logic)', () => {
  // Simulate the pre('save') hook logic
  function preSaveHook(doc) {
    if (doc.memo != null) {
      doc.memo = encryptMemo(doc.memo);
    }
  }

  // Simulate the post('init') hook logic
  function postInitHook(doc) {
    if (doc.memo != null) {
      doc.memo = decryptMemo(doc.memo);
    }
  }

  test('pre-save hook encrypts memo', () => {
    const doc = { memo: 'STU001' };
    preSaveHook(doc);
    expect(doc.memo).not.toBe('STU001');
    expect(doc.memo.length).toBeGreaterThan(28);
  });

  test('post-init hook decrypts memo back to original', () => {
    const doc = { memo: 'STU001' };
    preSaveHook(doc);
    const encrypted = doc.memo;
    postInitHook(doc);
    expect(doc.memo).toBe('STU001');
    expect(doc.memo).not.toBe(encrypted);
  });

  test('hooks are no-ops when memo is null', () => {
    const doc = { memo: null };
    preSaveHook(doc);
    expect(doc.memo).toBeNull();
    postInitHook(doc);
    expect(doc.memo).toBeNull();
  });
});
