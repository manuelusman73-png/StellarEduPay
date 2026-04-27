'use strict';

const mongoose = require('mongoose');
const softDelete = require('../utils/softDelete');
const memoEncryption = require('../utils/memoEncryption');

const paymentSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },

    // unique: false here — uniqueness is enforced by the compound index { schoolId, txHash } below
    txHash: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    feeAmount: { type: Number, default: null },
    feeCategory: { type: String, default: null, index: true },
    feeValidationStatus: { type: String, enum: ['valid', 'underpaid', 'overpaid', 'partial', 'unknown'], default: 'unknown' },
    excessAmount: { type: Number, default: 0 },

    assetCode: { type: String, default: null },
    assetType: { type: String, default: null },

    status: { type: String, enum: ['PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED', 'DISPUTED', 'INVALID'], default: 'PENDING' },
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

    // Orphan flag — set to true when the associated student is deleted
    studentDeleted: { type: Boolean, default: false, index: true },

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
// Compound unique index enforces per-school txHash uniqueness (same tx can exist in two schools).
// The single-field txHash index (inline, non-unique) is kept for cross-school lookups.
paymentSchema.index({ schoolId: 1, txHash: 1 }, { unique: true });
paymentSchema.index({ studentId: 1, confirmedAt: -1 });
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

paymentSchema.pre('save', function (next) {
  // Use in-memory Mongoose helpers instead of a DB query to avoid an N+1
  // round-trip on every save. this.isNew is true for inserts; for existing
  // documents Mongoose tracks the original field values so we can check the
  // persisted status without any additional database call.
  if (!this.isNew) {
    // $__getValue returns the current (possibly modified) value.
    // For the immutability check we need the *original* persisted status.
    // Mongoose stores it in this.$__.savedState when the document was loaded.
    const savedState = this.$__ && this.$__.savedState;
    const originalStatus = savedState ? savedState.status : this.status;

    if (originalStatus === 'SUCCESS' || originalStatus === 'FAILED') {
      return next(new Error('Payment audit trail is immutable once in SUCCESS or FAILED state'));
    }
  }

  // Encrypt memo field at rest using application-level AES-256-GCM encryption.
  // Encryption is a no-op when MEMO_ENCRYPTION_KEY is not set (graceful degradation).
  if (this.isModified('memo') && this.memo != null) {
    this.memo = memoEncryption.encryptMemo(this.memo);
  }

  next();
});

// Decrypt memo transparently after loading from the database.
// This runs for find(), findOne(), findById(), etc.
paymentSchema.post('init', function () {
  if (this.memo != null) {
    this.memo = memoEncryption.decryptMemo(this.memo);
  }
});

module.exports = mongoose.model('Payment', paymentSchema);
