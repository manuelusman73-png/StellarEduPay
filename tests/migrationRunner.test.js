const path = require('path');

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFind = jest.fn();
const mockCreate = jest.fn();

jest.mock('../backend/src/models/migrationModel', () => ({
  find: () => ({ lean: () => mockFind() }),
  create: (...args) => mockCreate(...args),
}));

jest.mock('fs', () => ({
  existsSync: () => true,
  readdirSync: () => mockFiles,
}));

let mockFiles = [];

const { runMigrations } = require('../backend/src/services/migrationRunner');

const MIGRATIONS_DIR = path.resolve(__dirname, '../backend/migrations');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequire(files) {
  const map = Object.fromEntries(
    files.map(f => [path.join(MIGRATIONS_DIR, f.name), f.module])
  );
  return id => {
    if (map[id]) return map[id];
    throw new Error(`Unexpected require: ${id}`);
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockFind.mockResolvedValue([]);
  mockCreate.mockResolvedValue({});
});

describe('runMigrations', () => {
  test('runs a pending migration and records it', async () => {
    const up = jest.fn().mockResolvedValue();
    const files = [{ name: '001_test.js', module: { version: '001_test', up } }];
    mockFiles = files.map(f => f.name);

    await runMigrations(makeRequire(files));

    expect(up).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({ version: '001_test' });
  });

  test('skips already-applied migrations', async () => {
    mockFind.mockResolvedValue([{ version: '001_test' }]);
    const up = jest.fn();
    const files = [{ name: '001_test.js', module: { version: '001_test', up } }];
    mockFiles = files.map(f => f.name);

    await runMigrations(makeRequire(files));

    expect(up).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('runs migrations in sorted filename order', async () => {
    const order = [];
    const files = [
      { name: '002_b.js', module: { version: '002_b', up: async () => order.push('002') } },
      { name: '001_a.js', module: { version: '001_a', up: async () => order.push('001') } },
    ];
    mockFiles = files.map(f => f.name);

    await runMigrations(makeRequire(files));

    expect(order).toEqual(['001', '002']);
  });

  test('only runs pending migrations when some are already applied', async () => {
    mockFind.mockResolvedValue([{ version: '001_a' }]);
    const up1 = jest.fn();
    const up2 = jest.fn().mockResolvedValue();
    const files = [
      { name: '001_a.js', module: { version: '001_a', up: up1 } },
      { name: '002_b.js', module: { version: '002_b', up: up2 } },
    ];
    mockFiles = files.map(f => f.name);

    await runMigrations(makeRequire(files));

    expect(up1).not.toHaveBeenCalled();
    expect(up2).toHaveBeenCalledTimes(1);
  });

  test('does nothing when all migrations are applied', async () => {
    mockFind.mockResolvedValue([{ version: '001_a' }, { version: '002_b' }]);
    const up = jest.fn();
    const files = [
      { name: '001_a.js', module: { version: '001_a', up } },
      { name: '002_b.js', module: { version: '002_b', up } },
    ];
    mockFiles = files.map(f => f.name);

    await runMigrations(makeRequire(files));

    expect(up).not.toHaveBeenCalled();
  });
});
