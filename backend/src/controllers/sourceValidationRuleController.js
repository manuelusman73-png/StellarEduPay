'use strict';

const SourceValidationRule = require('../models/sourceValidationRuleModel');

// POST /api/source-rules
async function createRule(req, res, next) {
  try {
    const { name, type, value, description, isActive, priority, maxTransactionsPerDay } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required.', code: 'VALIDATION_ERROR' });
    }

    const VALID_TYPES = ['blacklist', 'whitelist', 'pattern', 'new_sender_limit'];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        error: `type must be one of: ${VALID_TYPES.join(', ')}.`,
        code: 'VALIDATION_ERROR',
      });
    }

    if (['blacklist', 'whitelist', 'pattern'].includes(type) && !value) {
      return res.status(400).json({
        error: `value is required for type "${type}".`,
        code: 'VALIDATION_ERROR',
      });
    }

    if (type === 'pattern') {
      try {
        new RegExp(value); // eslint-disable-line no-new
      } catch {
        return res.status(400).json({ error: 'value is not a valid regular expression.', code: 'VALIDATION_ERROR' });
      }
    }

    const existing = await SourceValidationRule.findOne({ name });
    if (existing) {
      return res.status(409).json({ error: `A rule named "${name}" already exists.`, code: 'DUPLICATE_RULE' });
    }

    const rule = await SourceValidationRule.create({
      name,
      type,
      value: value || null,
      description: description || null,
      isActive: isActive !== undefined ? isActive : true,
      priority: priority !== undefined ? priority : 10,
      maxTransactionsPerDay: type === 'new_sender_limit' ? (maxTransactionsPerDay || 1) : null,
    });

    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
}

// GET /api/source-rules
async function getRules(req, res, next) {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

    const rules = await SourceValidationRule.find(filter).sort({ priority: 1, createdAt: 1 });
    res.json(rules);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/source-rules/:id
async function deleteRule(req, res, next) {
  try {
    const rule = await SourceValidationRule.findByIdAndDelete(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found.', code: 'NOT_FOUND' });
    }
    res.json({ message: `Rule "${rule.name}" deleted.` });
  } catch (err) {
    next(err);
  }
}

module.exports = { createRule, getRules, deleteRule };
