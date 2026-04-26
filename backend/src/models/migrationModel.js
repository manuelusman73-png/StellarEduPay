const mongoose = require('mongoose');

const migrationSchema = new mongoose.Schema({
  version:  { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now },
  // Set when the lock is first acquired. Lets operators identify stuck locks
  // in the event a migration fails mid-run.
  lockedAt: { type: Date },
});

module.exports = mongoose.model('Migration', migrationSchema);
