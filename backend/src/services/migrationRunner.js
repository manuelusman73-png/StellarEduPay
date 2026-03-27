const fs = require('fs');
const path = require('path');
const Migration = require('../models/migrationModel');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

/**
 * Run all pending migrations in version order.
 * Each migration file must export: { version: string, up: async function }
 * @param {Function} [_require] - injectable require for testing
 */
async function runMigrations(_require = require) {
  if (!fs.existsSync(MIGRATIONS_DIR)) return;

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  const applied = new Set(
    (await Migration.find({}).lean()).map(m => m.version)
  );

  for (const file of files) {
    const migration = _require(path.join(MIGRATIONS_DIR, file));
    if (applied.has(migration.version)) continue;

    console.log(`[Migration] Running: ${migration.version}`);
    await migration.up();
    await Migration.create({ version: migration.version });
    console.log(`[Migration] Applied: ${migration.version}`);
  }
}

module.exports = { runMigrations };
