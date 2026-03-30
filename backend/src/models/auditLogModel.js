'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    schoolId:     { type: String, required: true, index: true },
    action:       { type: String, required: true, index: true },
    performedBy:  { type: String, required: true },
    targetId:     { type: String, required: true, index: true },
    targetType:   { type: String, enum: ['student', 'payment', 'fee', 'school'], required: true, index: true },
    details:      { type: mongoose.Schema.Types.Mixed, default: {} },
    result:       { type: String, enum: ['success', 'failure'], default: 'success' },
    errorMessage: { type: String, default: null },
    ipAddress:    { type: String, default: null },
    userAgent:    { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
auditLogSchema.index({ schoolId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ schoolId: 1, targetType: 1, createdAt: -1 });
auditLogSchema.index({ schoolId: 1, performedBy: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
