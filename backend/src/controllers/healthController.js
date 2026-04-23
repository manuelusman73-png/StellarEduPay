'use strict';

const database = require('../config/database');
const { server } = require('../config/stellarConfig');
const config = require('../config');
const { concurrentPaymentProcessor } = require('../services/concurrentPaymentProcessor');

const STELLAR_CHECK_TIMEOUT_MS = Math.min(config.STELLAR_TIMEOUT_MS, 5000);

async function checkStellar() {
  const start = Date.now();
  const timer = setTimeout(() => {}, STELLAR_CHECK_TIMEOUT_MS);
  try {
    const stellarPromise = server.serverInfo();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Horizon did not respond within ${STELLAR_CHECK_TIMEOUT_MS}ms`)), STELLAR_CHECK_TIMEOUT_MS)
    );
    await Promise.race([stellarPromise, timeoutPromise]);
    clearTimeout(timer);
    return { status: 'healthy', latency_ms: Date.now() - start };
  } catch (err) {
    clearTimeout(timer);
    return { status: 'unhealthy', error: err.message, latency_ms: Date.now() - start };
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
      : { status: 'unhealthy', error: stellarResult.reason?.message };

  const allHealthy = db.healthy === true && stellar.status === 'healthy';

  const { queueDepth, maxQueueDepth } = concurrentPaymentProcessor.getStats();

  const body = {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: db.healthy ? 'healthy' : 'unhealthy',
        ...(db.latency !== undefined && { latency_ms: db.latency }),
        ...(db.readyState !== undefined && { readyState: db.readyState }),
        ...(db.reason && { error: db.reason }),
      },
      stellar: {
        ...stellar,
        network: config.STELLAR_NETWORK,
        horizonUrl: config.HORIZON_URL,
      },
      paymentProcessor: {
        queueDepth,
        maxQueueDepth,
      },
    },
  };

  return res.status(allHealthy ? 200 : 503).json(body);
}

module.exports = { healthCheck };
