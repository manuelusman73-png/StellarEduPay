'use strict';

/**
 * Retry Service Selector
 *
 * Chooses the appropriate retry backend at startup:
 *   - BullMQ (Redis-backed) when REDIS_HOST is configured
 *   - MongoDB-backed retryService as fallback
 *
 * Only one service is started; they must never run simultaneously to avoid
 * processing the same failed transaction twice.
 */

const logger = require('../utils/logger').child('RetryServiceSelector');

let _selected = null; // 'bullmq' | 'mongodb'

function useBullMQ() {
  return Boolean(process.env.REDIS_HOST);
}

function start() {
  if (useBullMQ()) {
    _selected = 'bullmq';
    logger.info('REDIS_HOST is set — retry backend: BullMQ');
    // BullMQ is initialised via initializeRetryQueue() in retryQueueSetup.js
    // (called in app.js after DB connect). Nothing to start here.
  } else {
    _selected = 'mongodb';
    logger.info('REDIS_HOST not set — retry backend: MongoDB (retryService)');
    const { startRetryWorker } = require('./retryService');
    startRetryWorker();
  }
}

function stop() {
  if (_selected === 'mongodb') {
    const { stopRetryWorker } = require('./retryService');
    stopRetryWorker();
  }
  // BullMQ shutdown is handled by retryQueueSetup.js gracefulShutdown
}

function isRunning() {
  if (_selected === 'mongodb') {
    const { isRetryWorkerRunning } = require('./retryService');
    return isRetryWorkerRunning();
  }
  return false; // BullMQ workers are managed internally
}

function getSelectedBackend() {
  return _selected;
}

module.exports = { start, stop, isRunning, getSelectedBackend, useBullMQ };
