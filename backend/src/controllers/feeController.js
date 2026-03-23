const FeeStructure = require('../models/feeStructureModel');

// POST /api/fees — create or update a fee structure for a class
async function createFeeStructure(req, res) {
  try {
    const { className, feeAmount, description, academicYear } = req.body;
    if (!className || feeAmount == null) {
      return res.status(400).json({ error: 'className and feeAmount are required' });
    }
    const fee = await FeeStructure.findOneAndUpdate(
      { className },
      { feeAmount, description, academicYear, isActive: true },
      { upsert: true, new: true, runValidators: true }
    );
    res.status(201).json(fee);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/fees — list all fee structures
async function getAllFeeStructures(req, res) {
  try {
    const fees = await FeeStructure.find({ isActive: true }).sort({ className: 1 });
    res.json(fees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/fees/:className — get fee structure for a specific class
async function getFeeByClass(req, res) {
  try {
    const fee = await FeeStructure.findOne({ className: req.params.className, isActive: true });
    if (!fee) return res.status(404).json({ error: `No fee structure found for class ${req.params.className}` });
    res.json(fee);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/fees/:className — deactivate a fee structure
async function deleteFeeStructure(req, res) {
  try {
    const fee = await FeeStructure.findOneAndUpdate(
      { className: req.params.className },
      { isActive: false },
      { new: true }
    );
    if (!fee) return res.status(404).json({ error: 'Fee structure not found' });
    res.json({ message: `Fee structure for class ${req.params.className} deactivated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createFeeStructure, getAllFeeStructures, getFeeByClass, deleteFeeStructure };
