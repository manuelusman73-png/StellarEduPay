'use strict';

const mongoose = require('mongoose');

const sourceValidationRuleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['blacklist', 'whitelist', 'pattern', 'new_sender_limit'],
    required: true
  },
  value: { type: String },                    // account ID or regex pattern
  description: { type: String },
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 10 },
  maxTransactionsPerDay: { type: Number, default: null }, // for new_sender_limit
}, { timestamps: true });

module.exports = mongoose.model('SourceValidationRule', sourceValidationRuleSchema);