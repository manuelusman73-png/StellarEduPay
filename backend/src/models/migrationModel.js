const mongoose = require('mongoose');

const migrationSchema = new mongoose.Schema({
  version: { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Migration', migrationSchema);
