'use strict';

const mongoose = require('mongoose');
const softDelete = require('../utils/softDelete');

const paymentSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },

    txHash: { type: String, required: true, unique: true, index: true },
    amount: { type: Number, required: true },
    feeAmount: { type: Number, default: null },
    feeCategory: { type: String, default: null, index: true },
    feeValidationStatus: { type: String, enum: ['valid', 'underpaid', 'overpaid', 'unknown'], default: 'unknown' },
    excessAmount: { type: Number, default: 0 },

    assetCode: { type: String, default: null },
    assetType: { type: String, default: null },

    status: { type: String, enum: ['PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED'], default: 'PENDING' },
    memo: { type: String },
    senderAddress: { type: String, default: null },
    isSuspicious: { type: Boolean, default: false },
    suspicionReason: { type: String, default: null },

    ledger: { type: Number, default: null },
    ledgerSequence: { type: Number, default: null },
    confirmationStatus: { type: String, enum: ['pending_confirmation', 'confirmed', 'failed'], default: 'pending_confirmation' },

    // Audit trail
    transactionHash: { type: String, default: null, index: true },
    startedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null, index: true },
    verifiedAt: { type: Date, default: null },

    // Payment locking
    lockedUntil: { type: Date, default: null },
    lockHolder: { type: String, default: null },

    // Reference code
    referenceCode: { type: String, default: null },

    // Soft Delete
    deletedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

softDelete(paymentSchema);

// Indexes
// Note: txHash single-field index is declared inline (unique: true, index: true) above.
// The compound below covers payment-history queries: filter by school+student, sort by date desc.
paymentSchema.index({ schoolId: 1, confirmedAt: -1 });
paymentSchema.index({ schoolId: 1, studentId: 1, confirmedAt: -1 });
paymentSchema.index({ schoolId: 1, feeValidationStatus: 1 });
paymentSchema.index({ schoolId: 1, isSuspicious: 1 });
paymentSchema.index({ schoolId: 1, confirmationStatus: 1 });
paymentSchema.index({ schoolId: 1, status: 1, confirmedAt: -1 });
paymentSchema.index({ schoolId: 1, studentId: 1, feeCategory: 1 });

paymentSchema.virtual('explorerUrl').get(function () {
  const hash = this.transactionHash || this.txHash;
  if (!hash) return null;
  const network = process.env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${network}/tx/${hash}`;
});

paymentSchema.virtual('stellarExplorerUrl').get(function () {
  return this.explorerUrl;
});

paymentSchema.pre('save', async function (next) {
  if (!this.isNew && this.isModified()) {
    try {
      const original = await mongoose.model('Payment').findById(this._id).lean();
      if (original && (original.status === 'SUCCESS' || original.status === 'FAILED')) {
        throw new Error('Payment audit trail is immutable once in SUCCESS or FAILED state');
      }
    } catch (err) {
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
