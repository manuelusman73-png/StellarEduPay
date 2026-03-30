"use strict";

const mongoose = require("mongoose");

const paymentIntentSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    studentId: { type: String, required: true },
    amount: { type: Number, required: true },
    feeCategory: { type: String, default: null },
    memo: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "completed", "expired"],
      default: "pending",
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

paymentIntentSchema.index({ schoolId: 1, studentId: 1 });
paymentIntentSchema.index({ schoolId: 1, status: 1 });
// Lookup intent by memo during payment sync
paymentIntentSchema.index({ schoolId: 1, memo: 1, status: 1 });
// Cleanup / TTL queries on expired intents
paymentIntentSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model("PaymentIntent", paymentIntentSchema);
