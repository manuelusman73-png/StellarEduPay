'use strict';

const { parseCsvBuffer } = require('../src/controllers/studentController');

async function testColumnLimits() {
  console.log('Running CSV column limit tests...');

  // Helper to create buffer
  const createBuffer = (csvContent) => Buffer.from(csvContent);

  const NL = String.fromCharCode(10);

  // 1. Test 1 column (Pass)
  const csv1 = 'header' + NL + 'value1';
  try {
    await parseCsvBuffer(createBuffer(csv1));
    console.log('PASS: 1 column passed');
  } catch (err) {
    console.error('FAIL: 1 column should have passed', err);
    process.exit(1);
  }

  // 2. Test 20 columns (Pass)
  const csv20 = Array.from({length: 20}, (_, i) => `h${i}`).join(',') + NL +
                Array.from({length: 20}, (_, i) => `v${i}`).join(',');
  try {
    await parseCsvBuffer(createBuffer(csv20));
    console.log('PASS: 20 columns passed');
  } catch (err) {
    console.error('FAIL: 20 columns should have passed', err);
    process.exit(1);
  }

  // 3. Test 21 columns (Fail)
  const csv21 = Array.from({length: 21}, (_, i) => `h${i}`).join(',') + NL +
                Array.from({length: 21}, (_, i) => `v${i}`).join(',');
  try {
    await parseCsvBuffer(createBuffer(csv21));
    console.error('FAIL: 21 columns should have failed');
    process.exit(1);
  } catch (err) {
    if (err.code === 'CSV_INVALID_FORMAT') {
      console.log('PASS: 21 columns failed as expected:', err.message);
    } else {
      console.error('FAIL: Expected CSV_INVALID_FORMAT but got:', err.code, err.message);
      process.exit(1);
    }
  }

  console.log('All tests passed!');
  process.exit(0);
}

testColumnLimits();
