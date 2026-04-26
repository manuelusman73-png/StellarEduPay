'use strict';

// Must set required env vars before app is loaded (config/index.js validates on require)
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B';

const request = require('supertest');

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(true),
  connection: {
    readyState: 1,
    close: jest.fn().mockResolvedValue(true),
    on: jest.fn(),
    db: {
      admin: jest.fn().mockReturnValue({ ping: jest.fn().mockResolvedValue(true) }),
    },
  },
  Schema: class {
    constructor() { this.index = jest.fn(); }
  },
  model: jest.fn().mockReturnValue({}),
}));

// database module — healthCheck is a controllable jest.fn()
jest.mock('../backend/src/config/database', () => ({
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true),
  healthCheck: jest.fn(),
  getConnectionInfo: jest.fn().mockReturnValue({}),
  getConnection: jest.fn(),
  POOL_CONFIG: {},
  RETRY_CONFIG: {},
  TRANSACTION_CONFIG: {},
}));

// stellarConfig — server.serverInfo is a controllable jest.fn()
jest.mock('../backend/src/config/stellarConfig', () => ({
  server: { serverInfo: jest.fn() },
  networkPassphrase: 'Test SDF Network ; September 2015',
  SCHOOL_WALLET: null,
  StellarSdk: {},
  ACCEPTED_ASSETS: {
    XLM: { code: 'XLM', type: 'native', issuer: null },
    USDC: {
      code: 'USDC',
      type: 'credit_alphanum4',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    },
  },
  CONFIRMATION_THRESHOLD: 2,
  isAcceptedAsset: jest.fn(),
  resolveAsset: jest.fn(),
}));

// Service mocks required for app.js bootstrap
jest.mock('../backend/src/config/retryQueueSetup', () => ({
  initializeRetryQueue: jest.fn(),
  setupMonitoring: jest.fn(),
}));

jest.mock('../backend/src/services/retryService', () => ({
  queueForRetry: jest.fn().mockResolvedValue(undefined),
  startRetryWorker: jest.fn(),
  stopRetryWorker: jest.fn(),
  isRetryWorkerRunning: jest.fn().mockReturnValue(false),
}));

jest.mock('../backend/src/services/transactionService', () => ({
  startPolling: jest.fn(),
  stopPolling: jest.fn(),
}));

jest.mock('../backend/src/services/consistencyScheduler', () => ({
  startConsistencyScheduler: jest.fn(),
}));

// Concurrent middleware — returns callable Express middleware stubs
jest.mock('../backend/src/middleware/concurrentRequestHandler', () => ({
  createConcurrentRequestMiddleware: jest.fn(() => ({
    rateLimiter: jest.fn(() => (req, res, next) => next()),
    requestQueue: jest.fn(() => (req, res, next) => next()),
  })),
}));

jest.mock('../backend/src/services/concurrentPaymentProcessor', () => ({
  concurrentPaymentProcessor: jest.fn(),
}));

// Route mocks — bypass pre-existing syntax errors in some route files
jest.mock('../backend/src/routes/schoolRoutes', () => {
  const fn = jest.fn((req, res, next) => next && next());
  fn.use = jest.fn().mockReturnThis();
  fn.get = jest.fn().mockReturnThis();
  fn.post = jest.fn().mockReturnThis();
  return fn;
});

jest.mock('../backend/src/routes/studentRoutes', () => {
  const fn = jest.fn((req, res, next) => next && next());
  fn.use = jest.fn().mockReturnThis();
  fn.get = jest.fn().mockReturnThis();
  fn.post = jest.fn().mockReturnThis();
  fn.patch = jest.fn().mockReturnThis();
  fn.delete = jest.fn().mockReturnThis();
  return fn;
});

jest.mock('../backend/src/routes/paymentRoutes', () => {
  const fn = jest.fn((req, res, next) => next && next());
  fn.use = jest.fn().mockReturnThis();
  fn.get = jest.fn().mockReturnThis();
  fn.post = jest.fn().mockReturnThis();
  return fn;
});

jest.mock('../backend/src/routes/feeRoutes', () => {
  const fn = jest.fn((req, res, next) => next && next());
  fn.use = jest.fn().mockReturnThis();
  fn.get = jest.fn().mockReturnThis();
  fn.post = jest.fn().mockReturnThis();
  fn.patch = jest.fn().mockReturnThis();
  return fn;
});

jest.mock('../backend/src/routes/reportRoutes', () => {
  const fn = jest.fn((req, res, next) => next && next());
  fn.use = jest.fn().mockReturnThis();
  fn.get = jest.fn().mockReturnThis();
  return fn;
});

jest.mock('../backend/src/controllers/consistencyController', () => ({
  runConsistencyCheck: jest.fn((req, res) => res.json({ status: 'ok' })),
}));

const app = require('../backend/src/app');

// Require the mocked modules so we can configure them per test
const database = require('../backend/src/config/database');
const stellarConfig = require('../backend/src/config/stellarConfig');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('200 healthy — DB and Stellar both up', async () => {
    database.healthCheck.mockResolvedValue({ healthy: true, latency: 3, readyState: 1 });
    stellarConfig.server.serverInfo.mockResolvedValue({
      network_passphrase: 'Test SDF Network ; September 2015',
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.checks.database.status).toBe('healthy');
    expect(res.body.checks.database.latency_ms).toBe(3);
    expect(res.body.checks.database.readyState).toBe(1);
    expect(res.body.checks.stellar.status).toBe('healthy');
    expect(res.body.checks.stellar.network).toBeDefined();
    expect(res.body.checks.stellar.horizonUrl).toBeDefined();
  });

  test('503 degraded — DB unreachable', async () => {
    database.healthCheck.mockResolvedValue({ healthy: false, reason: 'Not connected' });
    stellarConfig.server.serverInfo.mockResolvedValue({});

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.status).toBe('unhealthy');
    expect(res.body.checks.database.error).toBe('Not connected');
    expect(res.body.checks.stellar.status).toBe('healthy');
  });

  test('503 degraded — Stellar Horizon unreachable', async () => {
    database.healthCheck.mockResolvedValue({ healthy: true, latency: 4, readyState: 1 });
    stellarConfig.server.serverInfo.mockRejectedValue(new Error('Connection refused'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.status).toBe('healthy');
    expect(res.body.checks.stellar.status).toBe('unhealthy');
    expect(res.body.checks.stellar.error).toBe('Connection refused');
  });

  test('503 degraded — both DB and Stellar down', async () => {
    database.healthCheck.mockResolvedValue({ healthy: false, reason: 'Ping failed' });
    stellarConfig.server.serverInfo.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.status).toBe('unhealthy');
    expect(res.body.checks.stellar.status).toBe('unhealthy');
  });

  test('response always contains timestamp, checks.database, and checks.stellar', async () => {
    database.healthCheck.mockResolvedValue({ healthy: true, latency: 1, readyState: 1 });
    stellarConfig.server.serverInfo.mockResolvedValue({});

    const res = await request(app).get('/health');

    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('stellar');
    expect(res.body.checks.stellar).toHaveProperty('network');
    expect(res.body.checks.stellar).toHaveProperty('horizonUrl');
  });

  test('stellar check includes latency_ms on success', async () => {
    database.healthCheck.mockResolvedValue({ healthy: true, latency: 2, readyState: 1 });
    stellarConfig.server.serverInfo.mockResolvedValue({});

    const res = await request(app).get('/health');

    expect(typeof res.body.checks.stellar.latency_ms).toBe('number');
    expect(res.body.checks.stellar.latency_ms).toBeGreaterThanOrEqual(0);
  });

  test('stellar check includes latency_ms and error on failure', async () => {
    database.healthCheck.mockResolvedValue({ healthy: true, latency: 2, readyState: 1 });
    stellarConfig.server.serverInfo.mockRejectedValue(new Error('timeout'));

    const res = await request(app).get('/health');

    expect(typeof res.body.checks.stellar.latency_ms).toBe('number');
    expect(res.body.checks.stellar.latency_ms).toBeGreaterThanOrEqual(0);
    expect(res.body.checks.stellar.error).toBe('timeout');
  });

  test('database.healthCheck rejection is handled gracefully', async () => {
    database.healthCheck.mockRejectedValue(new Error('unexpected DB crash'));
    stellarConfig.server.serverInfo.mockResolvedValue({});

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.status).toBe('unhealthy');
  });
});
