'use strict';

/**
 * Migration 009 — Add compound indexes to pendingverifications (fix #399)
 *
 * The retry worker queries { status: 'pending', nextRetryAt: { $lte: now } }.
 * Without targeted indexes this becomes a full collection scan on every
 * retry interval (default 60 s), which degrades badly during Stellar outages
 * when the queue grows large.
 *
 * New indexes:
 *   { nextRetryAt: 1, attempts: 1 } — covers retry-worker queries that also
 *                                     filter/sort by attempt count.
 *   { schoolId: 1, nextRetryAt: 1 } — supports per-school retry filtering.
 */

const mongoose = require('mongoose');

const VERSION = '009_add_pending_verification_retry_indexes';

async function up() {
  const col = mongoose.connection.collection('pendingverifications');
  await col.createIndex({ nextRetryAt: 1, attempts: 1 }, { background: true });
  console.log('[009] Created index { nextRetryAt: 1, attempts: 1 } on pendingverifications');
  await col.createIndex({ schoolId: 1, nextRetryAt: 1 }, { background: true });
  console.log('[009] Created index { schoolId: 1, nextRetryAt: 1 } on pendingverifications');
}

async function down() {
  const col = mongoose.connection.collection('pendingverifications');
  await col.dropIndex({ nextRetryAt: 1, attempts: 1 });
  console.log('[009] Dropped index { nextRetryAt: 1, attempts: 1 } from pendingverifications');
  await col.dropIndex({ schoolId: 1, nextRetryAt: 1 });
  console.log('[009] Dropped index { schoolId: 1, nextRetryAt: 1 } from pendingverifications');
}

module.exports = { version: VERSION, up, down };
