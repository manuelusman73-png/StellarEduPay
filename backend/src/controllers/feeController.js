const FeeStructure = require('../models/feeStructureModel');

// POST /api/fees
async function createFeeStructure(req, res, next) {
  try {
    const { className, feeAmount, description, academicYear } = req.body;
    if (!className || feeAmount == null) {
      const err = new Error('className and feeAmount are required');
      err.code = 'VALIDATION_ERROR';
      return next(err);
    }
    const fee = await FeeStructure.findOneAndUpdate(
      { className },
      { feeAmount, description, academicYear, isActive: true },
      { upsert: true, new: true, runValidators: true }
    );
    res.status(201).json(fee);
  } catch (err) {
    next(err);
  }
}

// GET /api/fees
async function getAllFeeStructures(req, res, next) {
  try {
    const fees = await FeeStructure.find({ isActive: true }).sort({ className: 1 });
    res.json(fees);
  } catch (err) {
    next(err);
  }
}

// GET /api/fees/:className
async function getFeeByClass(req, res, next) {
  try {
    const fee = await FeeStructure.findOne({ className: req.params.className, isActive: true });
    if (!fee) {
      const err = new Error(`No fee structure found for class ${req.params.className}`);
      err.code = 'NOT_FOUND';
      return next(err);
    }
    res.json(fee);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/fees/:className
async function deleteFeeStructure(req, res, next) {
  try {
    const fee = await FeeStructure.findOneAndUpdate(
      { className: req.params.className },
      { isActive: false },
      { new: true }
    );
    if (!fee) {
      const err = new Error('Fee structure not found');
      err.code = 'NOT_FOUND';
      return next(err);
    }
    res.json({ message: `Fee structure for class ${req.params.className} deactivated` });
  } catch (err) {
    next(err);
  }
}

module.exports = { createFeeStructure, getAllFeeStructures, getFeeByClass, deleteFeeStructure };
