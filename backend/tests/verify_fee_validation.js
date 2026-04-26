'use strict';

const mongoose = require('mongoose');
const Student = require('../src/models/studentModel');

async function testValidation() {
  try {
    // 1. Create a student with invalid fee (0)
    console.log('Testing feeAmount: 0...');
    const s1 = new Student({
      schoolId: 'SCH1',
      studentId: 'STU1',
      name: 'Test Student',
      class: '10A',
      feeAmount: 0
    });
    
    try {
      await s1.validate();
      console.error('FAIL: feeAmount 0 should have failed validation');
    } catch (err) {
      console.log('PASS: Validation failed as expected:', err.errors.feeAmount.message);
    }

    // 2. Create a student with invalid fee (-50)
    console.log('Testing feeAmount: -50...');
    const s2 = new Student({
      schoolId: 'SCH1',
      studentId: 'STU2',
      name: 'Test Student',
      class: '10A',
      feeAmount: -50
    });

    try {
      await s2.validate();
      console.error('FAIL: feeAmount -50 should have failed validation');
    } catch (err) {
      console.log('PASS: Validation failed as expected:', err.errors.feeAmount.message);
    }

    // 3. Create a student with valid fee (500)
    console.log('Testing feeAmount: 500...');
    const s3 = new Student({
      schoolId: 'SCH1',
      studentId: 'STU3',
      name: 'Test Student',
      class: '10A',
      feeAmount: 500
    });

    try {
      await s3.validate();
      console.log('PASS: feeAmount 500 passed validation');
    } catch (err) {
      console.error('FAIL: feeAmount 500 should have passed validation:', err.message);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error during testing:', err);
    process.exit(1);
  }
}

testValidation();
