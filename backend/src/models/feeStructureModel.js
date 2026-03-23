const mongoose = require('mongoose');

const feeStructureSchema = new mongoose.Schema({
  className: { type: String, required: true, unique: true },
  feeAmount: { type: Number, required: true },
  description: { type: String, default: '' },
  academicYear: { type: String, default: () => new Date().getFullYear().toString() },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('FeeStructure', feeStructureSchema);
