'use strict';

const mongoose = require('mongoose');
const softDelete = require('../utils/softDelete');

const studentSchema = new mongoose.Schema(
  {
    schoolId:           { type: String, required: true, index: true },
    studentId:          { type: String, required: true, index: true, maxlength: [28, 'studentId must not exceed 28 characters (Stellar memo limit)'] },
    name:               { type: String, required: true },
    class:              { type: String, required: true, index: true },
    academicYear:       { type: String },
    feeAmount:          { type: Number, required: true, min: [0, 'Fee amount cannot be negative'] },
    paymentDeadline:    { type: Date, default: null },
    feePaid:            { type: Boolean, default: false, index: true },
    totalPaid:          { type: Number, default: 0 },
    remainingBalance:   { type: Number, default: null },

    // Parent contact for fee reminders
    parentEmail:        { type: String, default: null, trim: true, lowercase: true },
    parentPhone:        { type: String, default: null, trim: true },

    // Reminder tracking
    lastReminderSentAt: { type: Date, default: null },
    reminderCount:      { type: Number, default: 0 },
    reminderOptOut:     { type: Boolean, default: false },

    // Audit fields
    dateOfBirth:        { type: Date },
    gender:             { type: String },
    parentName:         { type: String },
    contactNumber:      { type: String },

    // Soft Delete
    deletedAt:          { type: Date, default: null, index: true },

    version:            { type: Number, default: 0 },
    lastPaymentAt:      { type: Date, default: null },
    lastPaymentHash:    { type: String, default: null },
    lastTransactionAt:  { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Apply soft delete utility
softDelete(studentSchema);

// isOverdue: true when a deadline is set, the fee is unpaid, and the deadline has passed
studentSchema.virtual('isOverdue').get(function () {
  return !this.feePaid && this.paymentDeadline != null && new Date() > this.paymentDeadline;
});

studentSchema.index({ studentId: 1, schoolId: 1 }, { unique: true });
studentSchema.index({ schoolId: 1, class: 1 });
studentSchema.index({ schoolId: 1, feePaid: 1 });
studentSchema.index({ studentId: 1, version: 1 });
studentSchema.index({ feePaid: 1, class: 1 });
studentSchema.index({ totalPaid: 1 });

studentSchema.pre('save', function (next) {
  next();
});

module.exports = mongoose.model('Student', studentSchema);
