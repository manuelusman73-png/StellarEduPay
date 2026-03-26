'use strict';

const { validateTransactionHash, validateTransactionHashes, sanitizeHash } = require('../backend/src/utils/hashValidator');

describe('Hash Validator', () => {
  describe('validateTransactionHash', () => {
    test('should accept valid 64-character hex hash', () => {
      const validHash = 'a'.repeat(64);
      const result = validateTransactionHash(validHash);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe(validHash);
      expect(result.error).toBeNull();
    });

    test('should accept mixed case hex hash and normalize to lowercase', () => {
      const mixedHash = 'A1B2C3D4E5F6' + '0'.repeat(52);
      const result = validateTransactionHash(mixedHash);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe(mixedHash.toLowerCase());
    });

    test('should reject hash with invalid length', () => {
      const shortHash = 'a'.repeat(63);
      const result = validateTransactionHash(shortHash);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_HASH_LENGTH');
      expect(result.error).toContain('64 characters');
    });

    test('should reject hash with non-hex characters', () => {
      const invalidHash = 'g'.repeat(64);
      const result = validateTransactionHash(invalidHash);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_HASH_FORMAT');
      expect(result.error).toContain('hexadecimal');
    });

    test('should reject empty hash', () => {
      const result = validateTransactionHash('');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_HASH');
    });

    test('should reject null hash', () => {
      const result = validateTransactionHash(null);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_HASH');
    });

    test('should reject non-string hash', () => {
      const result = validateTransactionHash(12345);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_HASH_TYPE');
    });

    test('should trim whitespace from hash', () => {
      const hashWithSpaces = '  ' + 'a'.repeat(64) + '  ';
      const result = validateTransactionHash(hashWithSpaces);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('a'.repeat(64));
    });
  });

  describe('validateTransactionHashes', () => {
    test('should validate array of valid hashes', () => {
      const hashes = ['a'.repeat(64), 'b'.repeat(64)];
      const result = validateTransactionHashes(hashes);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.normalized).toHaveLength(2);
    });

    test('should detect invalid hashes in array', () => {
      const hashes = ['a'.repeat(64), 'invalid', 'b'.repeat(64)];
      const result = validateTransactionHashes(hashes);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.normalized).toHaveLength(2);
    });

    test('should reject non-array input', () => {
      const result = validateTransactionHashes('not an array');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('array');
    });
  });

  describe('sanitizeHash', () => {
    test('should return normalized hash for valid input', () => {
      const hash = 'A'.repeat(64);
      const result = sanitizeHash(hash);
      expect(result).toBe('a'.repeat(64));
    });

    test('should return null for invalid input', () => {
      const result = sanitizeHash('invalid');
      expect(result).toBeNull();
    });
  });
});
