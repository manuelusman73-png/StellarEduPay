const FeeAdjustmentRule = require('../models/feeAdjustmentRuleModel');
const FeeStructure = require('../models/feeStructureModel');

class FeeAdjustmentService {
  /**
   * Calculate final fee after applying all applicable adjustments
   * @param {Object} feeStructure - from feeStructureModel
   * @param {Object} paymentContext - { student, paymentDate, baseAmount, ... }
   * @returns {Object} { finalFee, adjustmentsApplied: [{name, type, value, amountAdjusted}] }
   */
  async calculateAdjustedFee(feeStructure, paymentContext) {
    let finalFee = feeStructure.feeAmount;
    const adjustmentsApplied = [];

    const rules = await FeeAdjustmentRule.find({ isActive: true, ...(paymentContext.schoolId ? { schoolId: paymentContext.schoolId } : {}) })
      .sort({ priority: 1 }); // lower number = higher priority

    for (const rule of rules) {
      if (!this._ruleApplies(rule, paymentContext)) continue;

      let adjustmentAmount = 0;

      switch (rule.type) {
        case 'discount_percentage':
          adjustmentAmount = -(finalFee * rule.value / 100);
          break;
        case 'discount_fixed':
          adjustmentAmount = -rule.value;
          break;
        case 'penalty_percentage':
          adjustmentAmount = finalFee * rule.value / 100;
          break;
        case 'penalty_fixed':
          adjustmentAmount = rule.value;
          break;
        case 'waiver':
          adjustmentAmount = -finalFee; // full waiver
          break;
      }

      // Clamp so we don't go negative unless it's a full waiver
      finalFee = Math.max(0, finalFee + adjustmentAmount);

      adjustmentsApplied.push({
        ruleName: rule.name,
        type: rule.type,
        value: rule.value,
        amountAdjusted: Math.abs(adjustmentAmount),
        finalFeeAfterThis: finalFee
      });

      // If full waiver, we can early exit
      if (rule.type === 'waiver') break;
    }

    return {
      baseFee: feeStructure.feeAmount,
      finalFee: Math.round(finalFee * 100) / 100, // 2 decimal precision
      adjustmentsApplied
    };
  }

  _ruleApplies(rule, ctx) {
    const cond = rule.conditions || {};

    if (cond.studentClass?.length && !cond.studentClass.includes(ctx.student?.className)) return false;
    if (cond.academicYear && cond.academicYear !== ctx.academicYear) return false;
    if (cond.paymentBefore && new Date(ctx.paymentDate) > new Date(cond.paymentBefore)) return false;
    if (cond.paymentAfter && new Date(ctx.paymentDate) < new Date(cond.paymentAfter)) return false;
    if (cond.minAmount && ctx.baseAmount < cond.minAmount) return false;
    if (cond.maxAmount && ctx.baseAmount > cond.maxAmount) return false;

    return true;
  }
}

module.exports = new FeeAdjustmentService();