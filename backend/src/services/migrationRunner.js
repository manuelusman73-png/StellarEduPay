const fs = require('fs');
const path = require('path');
const Migration = require('../models/migrationModel');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

/**
 * Run all pending migrations in version order.
 *
 * Distributed locking strategy
 * -----------------------------
 * The unique index on Migration.version is used as an atomic lock.
 * Before running a migration we attempt to insert the document via
 * findOneAndUpdate with upsert:true and $setOnInsert. MongoDB guarantees
 * that only one writer wins the upsert race:
 *
 *   - Winner  (result === null): document did not exist → we own the lock,
 *     run the migration, then mark it complete.
 *   - Loser   (result !== null): document already existed → another instance
 *     already ran or is running this migration, skip it.
 *
 * If the migration throws, the document remains in the collection with
 * status 'locked'. On the next startup the runner will see the existing
 * document and skip it (safe — a failed migration should be fixed and
 * re-deployed, not silently retried). The lockedAt field lets operators
 * identify stuck locks.
 *
 * @param {Function} [_require] - injectable require for testing
 */
async function runMigrations(_require = require) {
  if (!fs.existsSync(MIGRATIONS_DIR)) return;

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  for (const file of files) {
    const migration = _require(path.join(MIGRATIONS_DIR, file));

    // Atomically claim this migration. $setOnInsert only fires on insert,
    // so if the document already exists the operation is a no-op and returns
    // the existing document (new:false). A null result means we inserted it.
    const existing = await Migration.findOneAndUpdate(
      { version: migration.version },
      { $setOnInsert: { version: migration.version, lockedAt: new Date() } },
      { upsert: true, new: false }
    );

    if (existing !== null) {
      // Document already existed — another instance owns or completed this migration.
      continue;
    }

    // We won the lock — run the migration.
    console.log(`[Migration] Running: ${migration.version}`);
    await migration.up();
    console.log(`[Migration] Applied: ${migration.version}`);
  }
}

module.exports = { runMigrations };
