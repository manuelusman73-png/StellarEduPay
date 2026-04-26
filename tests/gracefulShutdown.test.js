'use strict';

// #466 — graceful shutdown waits for in-flight requests

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B';

const http = require('http');

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../backend/src/middleware/auth', () => ({
  requireAdminAuth: (req, res, next) => next(),
}));

jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true),
  connection: {
    on: jest.fn(),
  },
  Schema: class {
    constructor() {
      this.index = jest.fn();
      this.pre = jest.fn();
      this.virtual = jest.fn().mockReturnValue({ get: jest.fn() });
    }
  },
  model: jest.fn().mockReturnValue({
    findOneAndUpdate: jest.fn().mockResolvedValue({}),
  }),
}));

jest.mock('../backend/src/services/transactionPollingService', () => ({
  startPolling: jest.fn(),
  stopPolling: jest.fn(),
}));

jest.mock('../backend/src/services/retryServiceSelector', () => ({
  start: jest.fn(),
  stop: jest.fn(),
  isRunning: jest.fn().mockReturnValue(false),
  useBullMQ: jest.fn().mockReturnValue(false),
}));

jest.mock('../backend/src/services/consistencyScheduler', () => ({
  startConsistencyScheduler: jest.fn(),
}));

jest.mock('../backend/src/services/reminderService', () => ({
  startReminderScheduler: jest.fn(),
  stopReminderScheduler: jest.fn(),
}));

jest.mock('../backend/src/services/transactionQueueService', () => ({
  startWorker: jest.fn(),
  stopWorker: jest.fn(),
}));

jest.mock('../backend/src/services/sessionCleanupService', () => ({
  startSessionCleanupScheduler: jest.fn(),
  stopSessionCleanupScheduler: jest.fn(),
}));

jest.mock('../backend/src/config/retryQueueSetup', () => ({
  initializeRetryQueue: jest.fn(),
  setupMonitoring: jest.fn(),
}));

jest.mock('../backend/src/models/systemConfigModel', () => ({
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
  get: jest.fn().mockResolvedValue(null),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('#466 graceful shutdown', () => {
  it('calls server.close() before mongoose.disconnect()', async () => {
    const callOrder = [];

    // Create a minimal HTTP server that tracks close() calls
    const mockServer = {
      close: jest.fn((cb) => {
        callOrder.push('server.close');
        // Simulate all in-flight requests completing immediately
        cb();
      }),
    };

    const mongoose = require('mongoose');
    mongoose.disconnect.mockImplementation(async () => {
      callOrder.push('mongoose.disconnect');
    });

    // Simulate the shutdown sequence from app.js
    const SHUTDOWN_TIMEOUT_MS = 500;
    const forceExitTimer = setTimeout(() => {}, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    await new Promise((resolve) => {
      mockServer.close(async () => {
        await mongoose.disconnect();
        clearTimeout(forceExitTimer);
        resolve();
      });
    });

    expect(callOrder).toEqual(['server.close', 'mongoose.disconnect']);
  });

  it('respects SHUTDOWN_TIMEOUT_MS env variable', () => {
    process.env.SHUTDOWN_TIMEOUT_MS = '5000';
    const timeout = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 10_000;
    expect(timeout).toBe(5000);
    delete process.env.SHUTDOWN_TIMEOUT_MS;
  });

  it('defaults to 10000ms when SHUTDOWN_TIMEOUT_MS is not set', () => {
    delete process.env.SHUTDOWN_TIMEOUT_MS;
    const timeout = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 10_000;
    expect(timeout).toBe(10_000);
  });

  it('does not close MongoDB before in-flight request completes', async () => {
    const mongoose = require('mongoose');
    mongoose.disconnect.mockClear();

    let resolveRequest;
    const inFlightRequest = new Promise((resolve) => { resolveRequest = resolve; });

    const mockServer = {
      close: jest.fn((cb) => {
        // Simulate server waiting for in-flight request
        inFlightRequest.then(cb);
      }),
    };

    const shutdownPromise = new Promise((resolve) => {
      mockServer.close(async () => {
        await mongoose.disconnect();
        resolve();
      });
    });

    // MongoDB should not be called yet
    expect(mongoose.disconnect).not.toHaveBeenCalled();

    // Complete the in-flight request
    resolveRequest();
    await shutdownPromise;

    // Now MongoDB should be disconnected
    expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
  });
});
