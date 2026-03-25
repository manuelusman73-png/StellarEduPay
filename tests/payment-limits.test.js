'use strict';

const { validatePaymentAmount, getPaymentLimits } = require('../backend/src/utils/paymentLimits');

describe('Payment Limits', () => {
  describe('getPaymentLimits', () => {
    it('should return configured payment limits', () => {
      const limits = getPaymentLimits();
      expect(limits).toHaveProperty('min');
      expect(limits).toHaveProperty('max');
      expect(typeof limits.min).toBe('number');
      expect(typeof limits.max).toBe('number');
      expect(limits.max).toBeGreaterThan(limits.min);
    });
  });

  describe('validatePaymentAmount', () => {
    it('should accept valid payment amounts within limits', () => {
      const result = validatePaymentAmount(100);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.code).toBeUndefined();
    });

    it('should reject payment amounts below minimum', () => {
      const result = validatePaymentAmount(0.001);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('below the minimum');
      expect(result.code).toBe('AMOUNT_TOO_LOW');
    });

    it('should reject payment amounts above maximum', () => {
      const result = validatePaymentAmount(200000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds the maximum');
      expect(result.code).toBe('AMOUNT_TOO_HIGH');
    });

    it('should reject zero payment amounts', () => {
      const result = validatePaymentAmount(0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than zero');
      expect(result.code).toBe('INVALID_AMOUNT');
    });

    it('should reject negative payment amounts', () => {
      const result = validatePaymentAmount(-10);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than zero');
      expect(result.code).toBe('INVALID_AMOUNT');
    });

    it('should reject non-numeric payment amounts', () => {
      const result = validatePaymentAmount('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid number');
      expect(result.code).toBe('INVALID_AMOUNT');
    });

    it('should reject NaN payment amounts', () => {
      const result = validatePaymentAmount(NaN);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid number');
      expect(result.code).toBe('INVALID_AMOUNT');
    });

    it('should accept payment amount at minimum limit', () => {
      const limits = getPaymentLimits();
      const result = validatePaymentAmount(limits.min);
      expect(result.valid).toBe(true);
    });

    it('should accept payment amount at maximum limit', () => {
      const limits = getPaymentLimits();
      const result = validatePaymentAmount(limits.max);
      expect(result.valid).toBe(true);
    });

    it('should reject payment amount just below minimum', () => {
      const limits = getPaymentLimits();
      const result = validatePaymentAmount(limits.min - 0.001);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('AMOUNT_TOO_LOW');
    });

    it('should reject payment amount just above maximum', () => {
      const limits = getPaymentLimits();
      const result = validatePaymentAmount(limits.max + 0.001);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('AMOUNT_TOO_HIGH');
    });
  });
});
