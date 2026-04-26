/**
 * Comprehensive tests for feeAdjustmentService.js and feeAdjustmentEngine.js
 * 
 * Tests cover:
 * - Percentage discounts
 * - Flat discounts
 * - Penalties
 * - Combined rules
 * - Edge cases (zero fee, negative results clamped to zero)
 * - Rule priority and ordering
 */

const feeAdjustmentService = require('../backend/src/services/feeAdjustmentService');
const { DynamicFeeAdjustmentEngine, feeEngine } = require('../backend/src/services/feeAdjustmentEngine');

// Mock FeeAdjustmentRule model
jest.mock('../backend/src/models/feeAdjustmentRuleModel', () => ({
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockResolvedValue([]),
  }),
}));

const FeeAdjustmentRule = require('../backend/src/models/feeAdjustmentRuleModel');

describe('FeeAdjustmentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock to return empty array by default
    FeeAdjustmentRule.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });
  });

  describe('calculateAdjustedFee', () => {
    it('should return base fee when no rules apply', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([]),
      });

      const feeStructure = { feeAmount: 250 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      expect(result.baseFee).toBe(250);
      expect(result.finalFee).toBe(250);
      expect(result.adjustmentsApplied).toHaveLength(0);
    });

    it('should apply percentage discount', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Early Payment',
            type: 'discount_percentage',
            value: 10,
            priority: 1,
            conditions: {},
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 250 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      expect(result.baseFee).toBe(250);
      expect(result.finalFee).toBe(225); // 250 - (250 * 0.10)
      expect(result.adjustmentsApplied).toHaveLength(1);
      expect(result.adjustmentsApplied[0].amountAdjusted).toBe(25);
    });

    it('should apply fixed discount', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Flat Discount',
            type: 'discount_fixed',
            value: 50,
            priority: 1,
            conditions: {},
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 250 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      expect(result.finalFee).toBe(200); // 250 - 50
      expect(result.adjustmentsApplied[0].amountAdjusted).toBe(50);
    });

    it('should apply percentage penalty', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Late Payment',
            type: 'penalty_percentage',
            value: 15,
            priority: 1,
            conditions: {},
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 250 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      expect(result.finalFee).toBe(287.5); // 250 + (250 * 0.15)
      expect(result.adjustmentsApplied[0].amountAdjusted).toBe(37.5);
    });

    it('should apply fixed penalty', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Processing Fee',
            type: 'penalty_fixed',
            value: 25,
            priority: 1,
            conditions: {},
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 250 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      expect(result.finalFee).toBe(275); // 250 + 25
      expect(result.adjustmentsApplied[0].amountAdjusted).toBe(25);
    });

    it('should apply waiver (full discount)', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Full Waiver',
            type: 'waiver',
            value: 0,
            priority: 1,
            conditions: {},
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 250 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      expect(result.finalFee).toBe(0);
      expect(result.adjustmentsApplied[0].amountAdjusted).toBe(250);
    });

    it('should apply multiple rules in priority order', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Early Payment',
            type: 'discount_percentage',
            value: 10,
            priority: 1,
            conditions: {},
            isActive: true,
          },
          {
            name: 'Volume Discount',
            type: 'discount_fixed',
            value: 20,
            priority: 2,
            conditions: {},
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 250 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      // First: 250 - (250 * 0.10) = 225
      // Then: 225 - 20 = 205
      expect(result.finalFee).toBe(205);
      expect(result.adjustmentsApplied).toHaveLength(2);
    });

    it('should clamp negative fees to zero', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Large Discount',
            type: 'discount_percentage',
            value: 150, // 150% discount (more than 100%)
            priority: 1,
            conditions: {},
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 250 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      expect(result.finalFee).toBe(0); // Clamped to 0, not negative
    });

    it('should respect rule conditions - student class', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Grade 5 Discount',
            type: 'discount_percentage',
            value: 20,
            priority: 1,
            conditions: { studentClass: ['Grade 5A', 'Grade 5B'] },
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 250 };
      const context = { student: { className: 'Grade 6A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      // Rule should not apply because student is not in Grade 5
      expect(result.finalFee).toBe(250);
      expect(result.adjustmentsApplied).toHaveLength(0);
    });

    it('should respect rule conditions - payment date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Early Payment',
            type: 'discount_percentage',
            value: 15,
            priority: 1,
            conditions: { paymentBefore: futureDate.toISOString() },
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 250 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      // Rule should apply because payment is before the deadline
      expect(result.finalFee).toBe(212.5); // 250 - (250 * 0.15)
    });

    it('should handle zero base fee', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Discount',
            type: 'discount_percentage',
            value: 10,
            priority: 1,
            conditions: {},
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 0 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      expect(result.finalFee).toBe(0);
    });

    it('should round to 2 decimal places', async () => {
      FeeAdjustmentRule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            name: 'Discount',
            type: 'discount_percentage',
            value: 33.33,
            priority: 1,
            conditions: {},
            isActive: true,
          },
        ]),
      });

      const feeStructure = { feeAmount: 100 };
      const context = { student: { className: 'Grade 5A' }, paymentDate: new Date() };

      const result = await feeAdjustmentService.calculateAdjustedFee(feeStructure, context);

      // 100 - (100 * 0.3333) = 66.67
      expect(result.finalFee).toBe(66.67);
    });
  });
});

describe('DynamicFeeAdjustmentEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new DynamicFeeAdjustmentEngine();
  });

  describe('calculateFee', () => {
    it('should return base fee when no rules match', () => {
      const context = { baseAmount: 250 };
      const result = engine.calculateFee(context);

      expect(result.baseFee).toBe(250);
      expect(result.finalFee).toBe(250);
      expect(result.adjustments).toHaveLength(0);
    });

    it('should apply early payment discount', () => {
      const context = { baseAmount: 250, isEarly: true };
      const result = engine.calculateFee(context);

      expect(result.finalFee).toBe(212.5); // 250 - (250 * 0.15)
      expect(result.adjustments).toHaveLength(1);
      expect(result.adjustments[0].ruleName).toBe('Early Payment Discount');
    });

    it('should apply student discount', () => {
      const context = { baseAmount: 250, userType: 'student' };
      const result = engine.calculateFee(context);

      expect(result.finalFee).toBe(200); // 250 - (250 * 0.20)
      expect(result.adjustments[0].ruleName).toBe('Student Discount');
    });

    it('should apply late payment penalty', () => {
      const context = { baseAmount: 250, isLate: true };
      const result = engine.calculateFee(context);

      expect(result.finalFee).toBe(280); // 250 + (250 * 0.12)
      expect(result.adjustments[0].ruleName).toBe('Late Payment Penalty');
    });

    it('should apply volume discount', () => {
      const context = { baseAmount: 250, totalPaymentsThisMonth: 3 };
      const result = engine.calculateFee(context);

      expect(result.finalFee).toBe(225); // 250 - (250 * 0.10)
      expect(result.adjustments[0].ruleName).toBe('Volume Discount');
    });

    it('should apply promo code discount', () => {
      const context = { baseAmount: 250, promoCode: 'EDU2026' };
      const result = engine.calculateFee(context);

      expect(result.finalFee).toBe(187.5); // 250 - (250 * 0.25)
      expect(result.adjustments[0].ruleName).toBe('Promo Code Discount');
    });

    it('should apply multiple matching rules', () => {
      const context = {
        baseAmount: 250,
        isEarly: true,
        userType: 'student',
      };
      const result = engine.calculateFee(context);

      // Early payment: 250 - (250 * 0.15) = 212.5
      // Student discount: 212.5 - (212.5 * 0.20) = 170
      expect(result.finalFee).toBe(170);
      expect(result.adjustments).toHaveLength(2);
    });

    it('should clamp negative fees to zero', () => {
      const context = {
        baseAmount: 100,
        isEarly: true,
        userType: 'student',
        promoCode: 'EDU2026',
      };
      const result = engine.calculateFee(context);

      // Multiple large discounts could result in negative
      expect(result.finalFee).toBeGreaterThanOrEqual(0);
    });

    it('should calculate effective rate', () => {
      const context = { baseAmount: 250, isEarly: true };
      const result = engine.calculateFee(context);

      // 212.5 / 250 * 100 = 85%
      expect(result.effectiveRate).toBe(85);
    });

    it('should handle zero base amount', () => {
      const context = { baseAmount: 0, isEarly: true };
      const result = engine.calculateFee(context);

      expect(result.finalFee).toBe(0);
      expect(result.effectiveRate).toBe(100);
    });

    it('should track total adjustments count', () => {
      const context = {
        baseAmount: 250,
        isEarly: true,
        userType: 'student',
      };
      const result = engine.calculateFee(context);

      expect(result.totalAdjustments).toBe(2);
    });

    it('should round final fee to 2 decimal places', () => {
      const context = { baseAmount: 333.33, isEarly: true };
      const result = engine.calculateFee(context);

      // 333.33 - (333.33 * 0.15) = 283.3305
      expect(result.finalFee).toBe(283.33);
    });
  });

  describe('addRule', () => {
    it('should add custom rule and maintain priority order', () => {
      const customRule = {
        id: 'custom-discount',
        name: 'Custom Discount',
        type: 'discount',
        condition: (ctx) => ctx.customFlag === true,
        value: 30,
        priority: 20,
        description: 'Custom 30% discount',
      };

      engine.addRule(customRule);

      const context = { baseAmount: 250, customFlag: true };
      const result = engine.calculateFee(context);

      expect(result.adjustments.some((a) => a.ruleName === 'Custom Discount')).toBe(true);
    });
  });

  describe('Singleton instance', () => {
    it('should have default rules loaded', () => {
      expect(feeEngine.rules.length).toBeGreaterThan(0);
    });

    it('should calculate fees correctly', () => {
      const context = { baseAmount: 250, isEarly: true };
      const result = feeEngine.calculateFee(context);

      expect(result.finalFee).toBe(212.5);
    });
  });

  describe('Edge cases', () => {
    it('should handle very small amounts', () => {
      const context = { baseAmount: 0.01, isEarly: true };
      const result = engine.calculateFee(context);

      expect(result.finalFee).toBeGreaterThanOrEqual(0);
      expect(result.finalFee).toBeLessThanOrEqual(0.01);
    });

    it('should handle very large amounts', () => {
      const context = { baseAmount: 1000000, isEarly: true };
      const result = engine.calculateFee(context);

      expect(result.finalFee).toBe(850000); // 1000000 - (1000000 * 0.15)
    });

    it('should handle missing context properties gracefully', () => {
      const context = { baseAmount: 250 };
      const result = engine.calculateFee(context);

      expect(result.finalFee).toBe(250);
      expect(result.adjustments).toHaveLength(0);
    });

    it('should handle null context properties', () => {
      const context = { baseAmount: 250, isEarly: null, userType: undefined };
      const result = engine.calculateFee(context);

      expect(result.finalFee).toBe(250);
    });
  });
});
