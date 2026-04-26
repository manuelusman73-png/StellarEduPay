'use strict';

// Must set required env vars before any module that loads config/index.js
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B';

const { extractMemo, extractByType } = require('../backend/src/services/parsers/memoExtractor');

describe('memoExtractor', () => {
  describe('extractMemo', () => {
    it('should handle missing memo', () => {
      const result = extractMemo({ memo: null });
      expect(result.content).toBeNull();
      expect(result.type).toBeNull();
    });

    it('should handle empty string memo', () => {
      const result = extractMemo({ memo: '' });
      expect(result.content).toBeNull();
      expect(result.type).toBeNull();
    });

    it('should extract string memo as MEMO_TEXT', () => {
      const result = extractMemo({ memo: 'STU001' });
      expect(result.content).toBe('STU001');
      expect(result.type).toBe('MEMO_TEXT');
      expect(result.encoding).toBeNull();
    });

    it('should trim whitespace from string memo', () => {
      const result = extractMemo({ memo: '  STU001  ' });
      expect(result.content).toBe('STU001');
      expect(result.type).toBe('MEMO_TEXT');
    });
  });

  describe('extractByType', () => {
    it('should extract MEMO_TEXT type', () => {
      const memoData = { type: 'text', value: 'STU001' };
      const result = extractByType(memoData);
      expect(result.content).toBe('STU001');
      expect(result.type).toBe('MEMO_TEXT');
    });

    it('should extract MEMO_TEXT with uppercase type', () => {
      const memoData = { type: 'MEMO_TEXT', value: 'STU001' };
      const result = extractByType(memoData);
      expect(result.content).toBe('STU001');
      expect(result.type).toBe('MEMO_TEXT');
    });

    it('should reject MEMO_ID type', () => {
      const memoData = { type: 'id', value: '12345' };
      const result = extractByType(memoData);
      expect(result.content).toBeNull();
      expect(result.type).toBe('MEMO_ID');
    });

    it('should reject MEMO_HASH type', () => {
      const memoData = { type: 'hash', value: 'abc123def456' };
      const result = extractByType(memoData);
      expect(result.content).toBeNull();
      expect(result.type).toBe('MEMO_HASH');
      expect(result.encoding).toBe('hex');
    });

    it('should reject MEMO_RETURN type', () => {
      const memoData = { type: 'return', value: 'abc123def456' };
      const result = extractByType(memoData);
      expect(result.content).toBeNull();
      expect(result.type).toBe('MEMO_RETURN');
      expect(result.encoding).toBe('hex');
    });

    it('should handle unknown memo type', () => {
      const memoData = { type: 'unknown', value: 'something' };
      const result = extractByType(memoData);
      expect(result.content).toBeNull();
      expect(result.type).toBe('UNKNOWN');
    });

    it('should handle underscore-prefixed type fields', () => {
      const memoData = { _type: 'text', _value: 'STU001' };
      const result = extractByType(memoData);
      expect(result.content).toBe('STU001');
      expect(result.type).toBe('MEMO_TEXT');
    });

    it('should handle null value', () => {
      const memoData = { type: 'text', value: null };
      const result = extractByType(memoData);
      expect(result.content).toBeNull();
      expect(result.type).toBe('MEMO_TEXT');
    });
  });
});
