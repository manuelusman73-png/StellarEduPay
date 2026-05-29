'use strict';

const database = require('../config/database');
const { server } = require('../config/stellarConfig');
const config = require('../config');
const { concurrentPaymentProcessor } = require('../services/concurrentPaymentProcessor');
const { getReminderStatus } = require('../services/reminderService');
const { getCachedRates } = require('../services/currencyConversionService');
const { getAuditHealth } = require('../services/auditService');

const STELLAR_CHECK_TIMEOUT_MS = 3000; // 3 second timeout for Stellar health check

async function checkStellar() {
  const start = Date.now();
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Horizon did not respond within ${STELLAR_CHECK_TIMEOUT_MS}ms`)), STELLAR_CHECK_TIMEOUT_MS)
    );
    await Promise.race([server.ledgers().limit(1).call(), timeoutPromise]);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'unreachable', error: err.message, latencyMs: Date.now() - start };
  }
}

async function healthCheck(req, res) {
  const [dbResult, stellarResult] = await Promise.allSettled([
    database.healthCheck(),
    checkStellar(),
  ]);

  const db =
    dbResult.status === 'fulfilled'
      ? dbResult.value
      : { healthy: false, reason: dbResult.reason?.message };

  const stellar =
    stellarResult.status === 'fulfilled'
      ? stellarResult.value
      : { status: 'unreachable', error: stellarResult.reason?.message };

  // Determine overall status:
  // - healthy: DB is up AND Stellar is ok
  // - degraded: DB is up BUT Stellar is unreachable
  // - unhealthy: DB is down
  let overallStatus = 'healthy';
  let statusCode = 200;

  if (db.healthy !== true) {
    overallStatus = 'unhealthy';
    statusCode = 503;
  } else if (stellar.status !== 'ok') {
    overallStatus = 'degraded';
    statusCode = 200; // Still return 200 since DB is up and cached data can be served
  }

  const { queueDepth, maxQueueDepth } = concurrentPaymentProcessor.getStats();

  // Retry queue backend info
  const retrySelector = require('../services/retryServiceSelector');
  const retryBackend = retrySelector.getSelectedBackend();
  const redisConfigured = Boolean(process.env.REDIS_HOST);

  // Price feed status
  const cachedRates = getCachedRates();
  const priceFeedStatus = Object.entries(cachedRates).map(([currency, data]) => {
    const staleAge = data.lastSuccessfulFetch
      ? Math.floor((Date.now() - new Date(data.lastSuccessfulFetch).getTime()) / 1000)
      : null;
    return {
      currency,
      available: true,
      lastFetchedAt: data.lastSuccessfulFetch || data.fetchedAt,
      staleAge,
    };
  });

  const body = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    logLevel: logger.getLevel(),
    checks: {
      database: {
        status: db.healthy ? 'healthy' : 'unhealthy',
        ...(db.latency !== undefined && { latency_ms: db.latency }),
        ...(db.readyState !== undefined && { readyState: db.readyState }),
        ...(db.reason && { error: db.reason }),
      },
      stellar: {
        status: stellar.status,
        ...(stellar.latencyMs !== undefined && { latency_ms: stellar.latencyMs }),
        ...(stellar.error && { error: stellar.error }),
        network: config.STELLAR_NETWORK,
        horizonUrl: config.HORIZON_URL,
      },
      paymentProcessor: {
        queueDepth,
        maxQueueDepth,
      },
      reminders: getReminderStatus(),
      retryQueue: {
        backend: retryBackend || 'not_started',
        redisConfigured,
        ...(redisConfigured && { redisHost: process.env.REDIS_HOST }),
      },
      priceFeed: {
        available: priceFeedStatus.length > 0,
        rates: priceFeedStatus,
      },
      auditLog: getAuditHealth(),
    },
  };

  return res.status(statusCode).json(body);
}

module.exports = { healthCheck };
