'use strict';

const mongoose = require('mongoose');

const feeStructureSchema = new mongoose.Schema(
  {
    schoolId:     { type: String, required: true, index: true },
    className:    { type: String, required: true },
    feeAmount:    { type: Number, required: true },
    description:  { type: String, default: '' },
    academicYear: { type: String, default: () => new Date().getUTCFullYear().toString() },
    isActive:     { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// className must be unique per school (was globally unique before)
feeStructureSchema.index({ schoolId: 1, className: 1 }, { unique: true });
feeStructureSchema.index({ schoolId: 1, isActive: 1 });

module.exports = mongoose.model('FeeStructure', feeStructureSchema);
