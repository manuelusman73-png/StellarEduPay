'use strict';

/**
 * Migration 011 — Encrypt existing plaintext memo fields in the payments collection.
 *
 * The Payment model now encrypts memo at rest using AES-256-GCM via
 * memoEncryption.js. This migration backfills all existing documents that
 * still have a plaintext memo.
 *
 * Prerequisites:
 *   - MEMO_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes).
 *   - If MEMO_ENCRYPTION_KEY is not set, this migration is a no-op.
 *
 * The migration is idempotent: it skips documents whose memo already looks
 * like an encrypted payload (base64url, length > 28 chars — Stellar's plain
 * text memo limit).
 */

const mongoose = require('mongoose');
const { encryptMemo, isEncryptionEnabled } = require('../src/utils/memoEncryption');

const VERSION = '011_encrypt_payment_memos';

async function up() {
  if (!isEncryptionEnabled()) {
    console.log('[011] MEMO_ENCRYPTION_KEY not set — skipping memo encryption migration.');
    return;
  }

  const collection = mongoose.connection.collection('payments');
  const cursor = collection.find({ memo: { $ne: null, $exists: true } });

  let processed = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    const memo = doc.memo;
    if (!memo) continue;

    // Heuristic: Stellar plain-text memos are ≤ 28 chars.
    // Encrypted payloads (12-byte IV + ciphertext + 16-byte tag, base64url) are
    // always longer. Skip documents that already appear encrypted.
    if (memo.length > 28) {
      skipped++;
      continue;
    }

    const encrypted = encryptMemo(memo);
    await collection.updateOne({ _id: doc._id }, { $set: { memo: encrypted } });
    processed++;
  }

  console.log(`[011] Memo encryption complete: ${processed} encrypted, ${skipped} already encrypted/skipped.`);
}

async function down() {
  // Decryption-based rollback is intentionally not implemented:
  // reversing encryption requires the key and would re-expose PII in plaintext.
  // To roll back, restore from a pre-migration backup.
  console.log('[011] down() is a no-op — restore from backup to reverse memo encryption.');
}

module.exports = { version: VERSION, up, down };
