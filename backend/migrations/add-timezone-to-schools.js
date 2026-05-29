'use strict';

const mongoose = require('mongoose');
const School = require('../src/models/schoolModel');

async function up() {
  await School.updateMany(
    { timezone: { $exists: false } },
    { $set: { timezone: 'UTC' } }
  );
  console.log('Migration complete: timezone field added to all schools');
}

async function down() {
  await School.updateMany({}, { $unset: { timezone: '' } });
}

module.exports = { up, down };
