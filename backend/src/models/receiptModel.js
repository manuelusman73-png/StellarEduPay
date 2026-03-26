'use strict';

const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema(
  {
    txHash:              { type: String, required: true, unique: true, index: true },
    studentId:           { type: String, required: true, index: true },
    schoolId:            { type: String, required: true, index: true },
    amount:              { type: Number, required: true },
    assetCode:           { type: String, default: 'XLM' },
    feeAmount:           { type: Number, default: null },
    feeValidationStatus: { type: String, enum: ['valid', 'overpaid', 'underpaid', 'unknown'], default: 'unknown' },
    memo:                { type: String, default: null },
    confirmedAt:         { type: Date, required: true },
    issuedAt:            { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Receipt', receiptSchema);
