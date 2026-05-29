'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.SCHOOL_WALLET_ADDRESS = 'GCICZOP346CKADPWOZ6JAQ7OCGH44UELNS3GSDXFOTSZRW6OYZZ6KSY7B';

describe('SIGTERM graceful shutdown', () => {
  let mockServer;
  let processExitSpy;
  let mongoose;
  let closeQueue;
  let shutdownQueue;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');

    mockServer = {
      close: jest.fn(),
    };

    jest.doMock('express', () => {
      const expressApp = {
        use: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        listen: jest.fn(() => mockServer),
      };
      const express = jest.fn(() => expressApp);
      express.json = jest.fn(() => jest.fn());
      return express;
    });

    jest.doMock('../backend/src/middleware/auth', () => ({
      requireAdminAuth: jest.fn((req, res, next) => next()),
    }));

    jest.doMock('../backend/src/services/paymentSavedSubscribers', () => ({
      registerPaymentSavedSubscribers: jest.fn(),
    }));

    jest.doMock('../backend/src/services/transactionPollingService', () => ({
      startPolling: jest.fn(),
      stopPolling: jest.fn(),
    }));

    jest.doMock('../backend/src/services/retryServiceSelector', () => ({
      start: jest.fn(),
      stop: jest.fn(),
      isRunning: jest.fn().mockReturnValue(false),
      useBullMQ: jest.fn().mockReturnValue(false),
    }));

    jest.doMock('../backend/src/services/consistencyScheduler', () => ({
      startConsistencyScheduler: jest.fn(),
    }));

    jest.doMock('../backend/src/services/reminderService', () => ({
      startReminderScheduler: jest.fn(),
      stopReminderScheduler: jest.fn(),
    }));

    jest.doMock('../backend/src/services/transactionQueueService', () => ({
      startWorker: jest.fn(),
      stopWorker: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock('../backend/src/services/sessionCleanupService', () => ({
      startSessionCleanupScheduler: jest.fn(),
      stopSessionCleanupScheduler: jest.fn(),
    }));

    jest.doMock('../backend/src/services/reconciliationService', () => ({
      startReconciliationScheduler: jest.fn(),
      stopReconciliationScheduler: jest.fn(),
    }));

    jest.doMock('../backend/src/config/retryQueueSetup', () => ({
      initializeRetryQueue: jest.fn().mockResolvedValue(undefined),
      setupMonitoring: jest.fn(),
    }));

    jest.doMock('../backend/src/middleware/errorHandler', () => ({
      notFoundHandler: jest.fn((req, res, next) => next()),
      globalErrorHandler: jest.fn((err, req, res, next) => res.status(500).json({ error: err.message })),
    }));

    jest.doMock('../backend/src/middleware/requestLogger', () => ({
      requestLogger: jest.fn(() => (req, res, next) => next()),
    }));

    jest.doMock('../backend/src/middleware/concurrentRequestHandler', () => ({
      createConcurrentRequestMiddleware: jest.fn(() => ({
        rateLimiter: jest.fn(() => (req, res, next) => next()),
        requestQueue: jest.fn(() => (req, res, next) => next()),
      })),
    }));

    jest.doMock('../backend/src/controllers/consistencyController', () => ({
      runConsistencyCheck: jest.fn((req, res) => res.status(200).json({ ok: true })),
    }));

    jest.doMock('../backend/src/controllers/healthController', () => ({
      healthCheck: jest.fn((req, res) => res.status(200).json({ ok: true })),
    }));

    jest.doMock('../backend/src/routes/studentRoutes', () => ({}));
    jest.doMock('../backend/src/routes/paymentRoutes', () => ({}));
    jest.doMock('../backend/src/routes/feeRoutes', () => ({}));
    jest.doMock('../backend/src/routes/reportRoutes', () => ({}));
    jest.doMock('../backend/src/routes/schoolRoutes', () => ({}));
    jest.doMock('../backend/src/routes/reminderRoutes', () => ({}));
    jest.doMock('../backend/src/routes/disputeRoutes', () => ({}));
    jest.doMock('../backend/src/routes/sourceValidationRuleRoutes', () => ({}));
    jest.doMock('../backend/src/routes/receiptsRoutes', () => ({}));
    jest.doMock('../backend/src/routes/feeAdjustmentRoutes', () => ({}));
    jest.doMock('../backend/src/routes/adminRoutes', () => ({}));
    jest.doMock('../backend/src/routes/authRoutes', () => ({}));

    jest.doMock('../backend/src/utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));

    jest.doMock('../backend/src/utils/corsOrigins', () => ({
      parseAllowedOrigins: jest.fn(() => []),
    }));

    jest.doMock('mongoose', () => ({
      connect: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(undefined),
      connection: { on: jest.fn() },
    }));

    jest.doMock('../backend/src/queue/transactionQueue', () => ({
      closeQueue: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock('../backend/src/services/bullMQRetryService', () => ({
      shutdownQueue: jest.fn().mockResolvedValue(undefined),
    }));

    mongoose = require('mongoose');
    closeQueue = require('../backend/src/queue/transactionQueue').closeQueue;
    shutdownQueue = require('../backend/src/services/bullMQRetryService').shutdownQueue;

    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
  });

  afterEach(() => {
    processExitSpy?.mockRestore();
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('waits for in-flight requests to complete before disconnecting and closing queues', async () => {
    let resolveRequest;
    const inFlightRequest = new Promise((resolve) => {
      resolveRequest = resolve;
    });

    mockServer.close.mockImplementation((cb) => {
      inFlightRequest.then(() => cb());
    });

    require('../backend/src/app');

    process.emit('SIGTERM');

    await Promise.resolve();

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mongoose.disconnect).not.toHaveBeenCalled();
    expect(closeQueue).not.toHaveBeenCalled();
    expect(shutdownQueue).not.toHaveBeenCalled();

    resolveRequest();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
    expect(closeQueue).toHaveBeenCalledTimes(1);
    expect(shutdownQueue).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });
});
