'use strict';

const FeeAdjustmentRule = require('../models/feeAdjustmentRuleModel');

const VALID_TYPES = ['discount_percentage', 'discount_fixed', 'penalty_percentage', 'penalty_fixed', 'waiver'];

function validateBody(body) {
  const { name, type, value } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required';
  if (!VALID_TYPES.includes(type)) return `type must be one of: ${VALID_TYPES.join(', ')}`;
  if (value == null || typeof value !== 'number' || value < 0) return 'value must be a non-negative number';
  return null;
}

// POST /api/fee-adjustments
async function createRule(req, res, next) {
  try {
    const validationError = validateBody(req.body);
    if (validationError) {
      const err = new Error(validationError);
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    const { name, type, value, conditions, priority, description } = req.body;
    const rule = await FeeAdjustmentRule.create({
      schoolId: req.schoolId,
      name: name.trim(),
      type,
      value,
      conditions: conditions || {},
      priority: priority ?? 10,
      description,
      isActive: true,
    });

    res.status(201).json(rule);
  } catch (err) {
    if (err.code === 11000) {
      err.message = `A rule named "${req.body.name}" already exists for this school`;
      err.code = 'DUPLICATE_RULE';
      err.status = 409;
    }
    next(err);
  }
}

// GET /api/fee-adjustments
async function listRules(req, res, next) {
  try {
    const rules = await FeeAdjustmentRule.find({ schoolId: req.schoolId }).sort({ priority: 1, name: 1 });
    res.json(rules);
  } catch (err) {
    next(err);
  }
}

// PUT /api/fee-adjustments/:id
async function updateRule(req, res, next) {
  try {
    const validationError = validateBody(req.body);
    if (validationError) {
      const err = new Error(validationError);
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    const { name, type, value, conditions, priority, description, isActive } = req.body;
    const rule = await FeeAdjustmentRule.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.schoolId },
      { name: name.trim(), type, value, conditions, priority, description, isActive },
      { new: true, runValidators: true }
    );

    if (!rule) {
      const err = new Error('Fee adjustment rule not found');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    res.json(rule);
  } catch (err) {
    if (err.code === 11000) {
      err.message = `A rule named "${req.body.name}" already exists for this school`;
      err.code = 'DUPLICATE_RULE';
      err.status = 409;
    }
    next(err);
  }
}

// DELETE /api/fee-adjustments/:id  — soft delete (deactivate)
async function deleteRule(req, res, next) {
  try {
    const rule = await FeeAdjustmentRule.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.schoolId },
      { isActive: false },
      { new: true }
    );

    if (!rule) {
      const err = new Error('Fee adjustment rule not found');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    res.json({ message: `Rule "${rule.name}" deactivated` });
  } catch (err) {
    next(err);
  }
}

module.exports = { createRule, listRules, updateRule, deleteRule };
