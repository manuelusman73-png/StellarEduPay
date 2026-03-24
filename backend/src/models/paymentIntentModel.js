const mongoose = require('mongoose');

const paymentIntentSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  amount: { type: Number, required: true },
  memo: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'completed', 'expired'], default: 'pending' },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.model('PaymentIntent', paymentIntentSchema);
