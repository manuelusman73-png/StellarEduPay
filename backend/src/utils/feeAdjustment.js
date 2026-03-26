'use strict';

/**
 * Dynamic Fee Adjustment Engine (Issue #74)
 * Supports percentage discounts/penalties, fixed amounts, multipliers.
 * Rules are easily extensible (add more in the array or load from DB later).
 */

const FEE_ADJUSTMENT_RULES = [
  // Example 1: Loyalty discount (if student has already paid something before)
  {
    id: 'loyalty-discount',
    name: 'Loyalty 10% off',
    type: 'percentage',
    value: -0.10,
    condition: (context) => context.previousTotal > 0,
    priority: 100,
  },
  // Example 2: Volume discount (big payments)
  {
    id: 'volume-discount',
    name: 'Volume 15% off',
    type: 'percentage',
    value: -0.15,
    condition: (context) => context.paymentAmount >= context.baseFee * 2,
    priority: 90,
  },
  // Example 3: Late payment penalty (you can add dueDate to Student model later)
  {
    id: 'late-penalty',
    name: 'Late payment +5%',
    type: 'percentage',
    value: 0.05,
    condition: (context) => context.isLate === true,
    priority: 50,
  },
  // Add more rules here (promo codes, student-specific, etc.)
];

/**
 * Calculate adjusted fee based on rules
 * @param {number} baseFee - Original feeAmount from student/feeStructure
 * @param {Object} context - Dynamic context for conditions
 * @returns {number} final adjusted fee (never negative)
 */
function calculateAdjustedFee(baseFee, context = {}) {
  let adjusted = baseFee;
  const sortedRules = [...FEE_ADJUSTMENT_RULES].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (!rule.condition || rule.condition(context)) {
      switch (rule.type) {
        case 'percentage':
          adjusted += adjusted * rule.value;
          break;
        case 'fixed':
          adjusted += rule.value;
          break;
        case 'multiplier':
          adjusted *= rule.value;
          break;
      }
    }
  }

  // Clamp to minimum 0 and round to 7 decimals (Stellar precision)
  return Math.max(0, parseFloat(adjusted.toFixed(7)));
}

/**
 * Build context object for rules (easy to extend)
 */
function buildFeeContext(student, paymentAmount, intent = null) {
  return {
    baseFee: student.feeAmount,
    paymentAmount: paymentAmount,
    previousTotal: student.totalPaid || 0,
    isLate: false,                    // ← set true if you add dueDate logic later
    className: student.class,
    hasPreviousPayments: (student.totalPaid || 0) > 0,
    // Add promoCode, studentType, etc. here when you extend the flow
  };
}

module.exports = {
  calculateAdjustedFee,
  buildFeeContext,
  // For future admin UI: expose rules
  getAdjustmentRules: () => FEE_ADJUSTMENT_RULES,
};