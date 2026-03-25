'use strict';

const FeeStructure = require('../models/feeStructureModel');
const { get, set, del, KEYS, TTL } = require('../cache');

// POST /api/fees
async function createFeeStructure(req, res, next) {
  try {
    const { schoolId } = req; // injected by resolveSchool middleware
    const { className, feeAmount, description, academicYear } = req.body;
    if (!className || feeAmount == null) {
      const err = new Error('className and feeAmount are required');
      err.code = 'VALIDATION_ERROR';
      return next(err);
    }
    const fee = await FeeStructure.findOneAndUpdate(
      { schoolId, className },
      { feeAmount, description, academicYear, isActive: true },
      { upsert: true, new: true, runValidators: true }
    );
    // Invalidate fee caches so next read reflects the change
    del(KEYS.feesAll(), KEYS.feeByClass(className));
    res.status(201).json(fee);
  } catch (err) {
    next(err);
  }
}

// GET /api/fees
async function getAllFeeStructures(req, res, next) {
  try {
    const cacheKey = KEYS.feesAll();
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const fees = await FeeStructure.find({ schoolId: req.schoolId, isActive: true }).sort({ className: 1 });
    set(cacheKey, fees, TTL.FEES);
    res.json(fees);
  } catch (err) {
    next(err);
  }
}

// GET /api/fees/:className
async function getFeeByClass(req, res, next) {
  try {
    const { className } = req.params;
    const cacheKey = KEYS.feeByClass(className);
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const fee = await FeeStructure.findOne({
      schoolId: req.schoolId,
      className: req.params.className,
      isActive: true,
    });
    if (!fee) {
      const err = new Error(`No fee structure found for class ${className}`);
      err.code = 'NOT_FOUND';
      return next(err);
    }
    set(cacheKey, fee, TTL.FEES);
    res.json(fee);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/fees/:className
async function deleteFeeStructure(req, res, next) {
  try {
    const { className } = req.params;
    const fee = await FeeStructure.findOneAndUpdate(
      { schoolId: req.schoolId, className: req.params.className },
      { isActive: false },
      { new: true }
    );
    if (!fee) {
      const err = new Error('Fee structure not found');
      err.code = 'NOT_FOUND';
      return next(err);
    }
    // Invalidate fee caches
    del(KEYS.feesAll(), KEYS.feeByClass(className));
    res.json({ message: `Fee structure for class ${className} deactivated` });
  } catch (err) {
    next(err);
  }
}

module.exports = { createFeeStructure, getAllFeeStructures, getFeeByClass, deleteFeeStructure };
