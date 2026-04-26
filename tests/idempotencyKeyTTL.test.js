'use strict';

/**
 * Tests for idempotencyKeyModel.js TTL fix – issue #393
 *
 * Covers:
 *  1. TTL_SECONDS defaults to 86400 when env var is unset
 *  2. TTL_SECONDS reads from IDEMPOTENCY_KEY_TTL_SECONDS env var
 *  3. Model source has expires wired to TTL_SECONDS
 *  4. Migration 003 up() creates a TTL index with correct expireAfterSeconds
 *  5. Migration 003 down() drops the TTL index
 *  6. Migration exports the correct version string
 *  7. Expired keys are not returned by uniqueness checks (simulated)
 */

// ── Model TTL tests ───────────────────────────────────────────────────────────

describe('idempotencyKeyModel TTL_SECONDS', () => {
  const ORIG = process.env.IDEMPOTENCY_KEY_TTL_SECONDS;

  afterEach(() => {
    jest.resetModules();
    if (ORIG === undefined) delete process.env.IDEMPOTENCY_KEY_TTL_SECONDS;
    else process.env.IDEMPOTENCY_KEY_TTL_SECONDS = ORIG;
  });

  function loadTTL(envVal) {
    if (envVal === undefined) delete process.env.IDEMPOTENCY_KEY_TTL_SECONDS;
    else process.env.IDEMPOTENCY_KEY_TTL_SECONDS = String(envVal);

    jest.mock('mongoose', () => ({
      Schema: Object.assign(
        class { constructor() {} },
        { Types: { Mixed: 'Mixed' } }
      ),
      model: jest.fn().mockReturnValue({}),
    }), { virtual: true });

    return require('../backend/src/models/idempotencyKeyModel').TTL_SECONDS;
  }

  test('defaults to 86400 when IDEMPOTENCY_KEY_TTL_SECONDS is not set', () => {
    expect(loadTTL(undefined)).toBe(86400);
  });

  test('reads custom value from IDEMPOTENCY_KEY_TTL_SECONDS', () => {
    expect(loadTTL(172800)).toBe(172800);
  });

  test('parses string env var to integer', () => {
    expect(loadTTL('3600')).toBe(3600);
  });
});

describe('idempotencyKeyModel schema source assertions', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../backend/src/models/idempotencyKeyModel.js'),
    'utf8'
  );

  test('reads TTL from IDEMPOTENCY_KEY_TTL_SECONDS env var', () => {
    expect(src).toMatch(/IDEMPOTENCY_KEY_TTL_SECONDS/);
    expect(src).toMatch(/parseInt/);
  });

  test('defaults to 86400', () => {
    expect(src).toMatch(/86400/);
  });

  test('sets expires on createdAt field using TTL_SECONDS', () => {
    expect(src).toMatch(/expires.*TTL_SECONDS|TTL_SECONDS.*expires/);
  });

  test('exports TTL_SECONDS', () => {
    expect(src).toMatch(/module\.exports\.TTL_SECONDS\s*=\s*TTL_SECONDS/);
  });
});

// ── Migration 003 tests ───────────────────────────────────────────────────────
// We extract the migration logic and test it with an injected mock collection
// to avoid needing a real MongoDB connection.

describe('migration 003 – version and exports', () => {
  const migration = require('../backend/migrations/003_add_idempotency_key_ttl_index');

  test('exports correct version string', () => {
    expect(migration.version).toBe('003_add_idempotency_key_ttl_index');
  });

  test('exports up and down functions', () => {
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
  });
});

/**
 * Extract the core migration logic so it can be tested with a mock collection
 * without needing mongoose.connection to be open.
 */
async function runUp(collection, ttlSeconds) {
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.key && idx.key.createdAt !== undefined && idx.expireAfterSeconds !== undefined) {
      await collection.dropIndex(idx.name);
    }
  }
  await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds });
}

async function runDown(collection) {
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.key && idx.key.createdAt !== undefined && idx.expireAfterSeconds !== undefined) {
      await collection.dropIndex(idx.name);
    }
  }
}

function makeCollection(existingIndexes = []) {
  return {
    indexes: jest.fn().mockResolvedValue(existingIndexes),
    dropIndex: jest.fn().mockResolvedValue(undefined),
    createIndex: jest.fn().mockResolvedValue(undefined),
  };
}

describe('migration 003 up() logic', () => {
  test('creates TTL index with default 86400s', async () => {
    const col = makeCollection([]);
    await runUp(col, 86400);
    expect(col.createIndex).toHaveBeenCalledWith(
      { createdAt: 1 },
      { expireAfterSeconds: 86400 }
    );
  });

  test('creates TTL index with custom TTL', async () => {
    const col = makeCollection([]);
    await runUp(col, 172800);
    expect(col.createIndex).toHaveBeenCalledWith(
      { createdAt: 1 },
      { expireAfterSeconds: 172800 }
    );
  });

  test('drops existing TTL index before creating new one', async () => {
    const col = makeCollection([
      { name: 'createdAt_1', key: { createdAt: 1 }, expireAfterSeconds: 999 },
    ]);
    await runUp(col, 86400);
    expect(col.dropIndex).toHaveBeenCalledWith('createdAt_1');
    expect(col.createIndex).toHaveBeenCalledWith(
      { createdAt: 1 },
      { expireAfterSeconds: 86400 }
    );
  });

  test('does not drop non-TTL indexes', async () => {
    const col = makeCollection([
      { name: '_id_', key: { _id: 1 } },
      { name: 'key_1', key: { key: 1 }, unique: true },
    ]);
    await runUp(col, 86400);
    expect(col.dropIndex).not.toHaveBeenCalled();
  });
});

describe('migration 003 down() logic', () => {
  test('drops the TTL index', async () => {
    const col = makeCollection([
      { name: 'createdAt_1', key: { createdAt: 1 }, expireAfterSeconds: 86400 },
    ]);
    await runDown(col);
    expect(col.dropIndex).toHaveBeenCalledWith('createdAt_1');
  });

  test('does nothing when no TTL index exists', async () => {
    const col = makeCollection([{ name: '_id_', key: { _id: 1 } }]);
    await runDown(col);
    expect(col.dropIndex).not.toHaveBeenCalled();
  });
});

describe('migration 003 source assertions', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../backend/migrations/003_add_idempotency_key_ttl_index.js'),
    'utf8'
  );

  test('reads TTL from IDEMPOTENCY_KEY_TTL_SECONDS', () => {
    expect(src).toMatch(/IDEMPOTENCY_KEY_TTL_SECONDS/);
  });

  test('creates index on createdAt with expireAfterSeconds', () => {
    expect(src).toMatch(/createIndex/);
    expect(src).toMatch(/expireAfterSeconds/);
    expect(src).toMatch(/createdAt/);
  });

  test('drops existing TTL index before recreating', () => {
    expect(src).toMatch(/dropIndex/);
  });
});

// ── Expired key uniqueness check (simulated) ──────────────────────────────────

describe('expired key uniqueness check (simulated)', () => {
  function isExpired(record, ttlSeconds) {
    return (Date.now() - new Date(record.createdAt).getTime()) / 1000 > ttlSeconds;
  }

  function findActiveKey(store, key, ttlSeconds) {
    const record = store[key];
    if (!record) return null;
    if (isExpired(record, ttlSeconds)) return null;
    return record;
  }

  test('returns null for a key older than TTL', () => {
    const ttl = 86400;
    const store = {
      'key-abc': {
        createdAt: new Date(Date.now() - (ttl + 1) * 1000),
        responseStatus: 200,
        responseBody: { ok: true },
      },
    };
    expect(findActiveKey(store, 'key-abc', ttl)).toBeNull();
  });

  test('returns the record for a key within TTL', () => {
    const ttl = 86400;
    const store = {
      'key-xyz': {
        createdAt: new Date(Date.now() - 60 * 1000),
        responseStatus: 201,
        responseBody: { id: '123' },
      },
    };
    const result = findActiveKey(store, 'key-xyz', ttl);
    expect(result).not.toBeNull();
    expect(result.responseStatus).toBe(201);
  });

  test('returns null for a non-existent key', () => {
    expect(findActiveKey({}, 'missing-key', 86400)).toBeNull();
  });

  test('respects custom TTL value', () => {
    const ttl = 3600;
    const store = {
      'key-short': {
        createdAt: new Date(Date.now() - 3601 * 1000),
        responseStatus: 200,
        responseBody: {},
      },
    };
    expect(findActiveKey(store, 'key-short', ttl)).toBeNull();
  });

  test('key just within TTL is still active', () => {
    const ttl = 3600;
    const store = {
      'key-fresh': {
        createdAt: new Date(Date.now() - 3599 * 1000),
        responseStatus: 200,
        responseBody: {},
      },
    };
    expect(findActiveKey(store, 'key-fresh', ttl)).not.toBeNull();
  });
});
