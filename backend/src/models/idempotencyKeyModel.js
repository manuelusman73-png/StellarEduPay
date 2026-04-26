'use strict';

const mongoose = require('mongoose');

// TTL in seconds for idempotency key records.
// Configurable via IDEMPOTENCY_KEY_TTL_SECONDS (default: 86400 = 24 hours).
// MongoDB's TTL index will automatically delete documents after this period.
const TTL_SECONDS = parseInt(process.env.IDEMPOTENCY_KEY_TTL_SECONDS || '86400', 10);

/**
 * Stores idempotency key → cached response mappings.
 * TTL index automatically purges records after IDEMPOTENCY_KEY_TTL_SECONDS.
 */
const idempotencyKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  requestPath: { type: String, required: true },
  responseStatus: { type: Number, required: true },
  responseBody: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: TTL_SECONDS },
});

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
module.exports.TTL_SECONDS = TTL_SECONDS;
