#!/usr/bin/env node
'use strict';

/**
 * Seed script — populates the database with sample fee structures and students
 * for local development and testing.
 *
 * Usage:
 *   node scripts/seed-test-data.js
 *
 * Requirements:
 *   - backend/.env must exist with MONGO_URI and SCHOOL_WALLET_ADDRESS set
 *   - MongoDB must be running
 *
 * Safe to re-run: existing records are skipped (upsert / insertIfAbsent).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../backend/.env') });

// Validate env before touching mongoose
const MONGO_URI = process.env.MONGO_URI;
const SCHOOL_WALLET_ADDRESS = process.env.SCHOOL_WALLET_ADDRESS || 'PLACEHOLDER';

if (!MONGO_URI) {
  console.error('❌  MONGO_URI is not set. Check backend/.env');
  process.exit(1);
}

// Patch env so config/index.js validation passes
process.env.SCHOOL_WALLET_ADDRESS = SCHOOL_WALLET_ADDRESS;

const mongoose = require('../backend/node_modules/mongoose');
const FeeStructure = require('../backend/src/models/feeStructureModel');
const Student = require('../backend/src/models/studentModel');

// ── Seed data ─────────────────────────────────────────────────────────────────

const FEE_STRUCTURES = [
  { className: 'Grade 9',  feeAmount: 500,  description: 'Junior Secondary' },
  { className: 'Grade 10', feeAmount: 550,  description: 'Junior Secondary' },
  { className: 'Grade 11', feeAmount: 600,  description: 'Senior Secondary' },
  { className: 'Grade 12', feeAmount: 650,  description: 'Senior Secondary' },
];

const STUDENTS = [
  { studentId: 'STU001', name: 'Alice Johnson',   class: 'Grade 9'  },
  { studentId: 'STU002', name: 'Bob Martinez',    class: 'Grade 9'  },
  { studentId: 'STU003', name: 'Carol Williams',  class: 'Grade 10' },
  { studentId: 'STU004', name: 'David Osei',      class: 'Grade 10' },
  { studentId: 'STU005', name: 'Eva Mensah',      class: 'Grade 11' },
  { studentId: 'STU006', name: 'Frank Asante',    class: 'Grade 11' },
  { studentId: 'STU007', name: 'Grace Nkrumah',   class: 'Grade 12' },
  { studentId: 'STU008', name: 'Henry Boateng',   class: 'Grade 12' },
  // One student with a partial payment already recorded (for payment flow testing)
  { studentId: 'STU009', name: 'Irene Adjei',     class: 'Grade 12', totalPaid: 200, remainingBalance: 450 },
  // One student marked as fully paid (for dashboard/filter testing)
  { studentId: 'STU010', name: 'James Owusu',     class: 'Grade 9',  feePaid: true,  totalPaid: 500, remainingBalance: 0 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Upsert fee structures — update feeAmount/description if the class already
 * exists so re-runs stay consistent.
 */
async function seedFeeStructures() {
  console.log('\n📋  Seeding fee structures…');
  const feeMap = {};

  for (const fee of FEE_STRUCTURES) {
    const doc = await FeeStructure.findOneAndUpdate(
      { className: fee.className },
      { ...fee, isActive: true },
      { upsert: true, new: true, runValidators: true }
    );
    feeMap[doc.className] = doc.feeAmount;
    console.log(`   ✔  ${doc.className} — $${doc.feeAmount} USDC`);
  }

  return feeMap;
}

/**
 * Insert students that don't already exist (skip duplicates by studentId).
 * Resolves feeAmount from the fee map so the seed is self-contained.
 */
async function seedStudents(feeMap) {
  console.log('\n🎓  Seeding students…');
  let created = 0;
  let skipped = 0;

  for (const s of STUDENTS) {
    const exists = await Student.exists({ studentId: s.studentId });
    if (exists) {
      console.log(`   ⏭   ${s.studentId} (${s.name}) — already exists, skipped`);
      skipped++;
      continue;
    }

    const feeAmount = feeMap[s.class];
    if (!feeAmount) {
      console.warn(`   ⚠️   No fee structure found for class "${s.class}" — skipping ${s.studentId}`);
      skipped++;
      continue;
    }

    await Student.create({ feeAmount, ...s });
    console.log(`   ✔  ${s.studentId} — ${s.name} (${s.class}, $${feeAmount} USDC)`);
    created++;
  }

  return { created, skipped };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  StellarEduPay — test data seed');
  console.log(`    MongoDB: ${MONGO_URI}`);

  await mongoose.connect(MONGO_URI);
  console.log('    Connected to MongoDB');

  const feeMap = await seedFeeStructures();
  const { created, skipped } = await seedStudents(feeMap);

  console.log('\n✅  Done.');
  console.log(`    Students created: ${created}  |  skipped: ${skipped}`);
  console.log('\n    Quick test commands:');
  console.log('      GET  http://localhost:5000/api/students');
  console.log('      GET  http://localhost:5000/api/fees');
  console.log('      GET  http://localhost:5000/api/students/STU001\n');
}

main()
  .catch((err) => {
    console.error('\n❌  Seed failed:', err.message);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
