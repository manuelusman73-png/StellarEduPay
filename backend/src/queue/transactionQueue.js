'use strict';

/**
 * Transaction Processing Queue
 *
 * Handles incoming Stellar transactions asynchronously via BullMQ so that
 * the HTTP layer returns immediately (202 Accepted) and traffic spikes are
 * absorbed by the worker concurrency limit rather than overwhelming the
 * Horizon API or MongoDB.
 */

const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const logger = require('../utils/logger');

const QUEUE_NAME = 'transaction-processing';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // required by BullMQ
};

// Shared Redis connection for the queue
const connection = new Redis(redisConfig);
connection.on('error', (err) => logger.error('[TransactionQueue] Redis error', { error: err.message }));

const transactionQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 500 },
    removeOnFail: false,
  },
});

/**
 * Enqueue a transaction for async processing.
 * @param {string} txHash
 * @param {Object} context  - { schoolId, school, studentId }
 * @returns {Promise<Job>}
 */
async function enqueueTransaction(txHash, context = {}) {
  const job = await transactionQueue.add(
    'verify-transaction',
    { txHash, ...context },
    { jobId: txHash } // deduplicate by txHash
  );
  logger.info('[TransactionQueue] Enqueued transaction', { txHash, jobId: job.id });
  return job;
}

/**
 * Get the current status of a queued transaction job.
 * @param {string} txHash
 */
async function getJobStatus(txHash) {
  const job = await transactionQueue.getJob(txHash);
  if (!job) return null;

  const state = await job.getState();
  return {
    jobId: job.id,
    txHash: job.data.txHash,
    state,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason || null,
    result: job.returnvalue || null,
    createdAt: new Date(job.timestamp).toISOString(),
    processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
  };
}

/**
 * Start the BullMQ worker that processes queued transactions.
 * The processor function is injected so this module stays decoupled
 * from the payment controller / stellar service.
 *
 * @param {Function} processor  async (job) => result
 */
function startTransactionWorker(processor) {
  const worker = new Worker(QUEUE_NAME, processor, {
    connection: new Redis(redisConfig),
    concurrency: parseInt(process.env.TX_QUEUE_CONCURRENCY, 10) || 5,
  });

  worker.on('completed', (job) =>
    logger.info('[TransactionQueue] Job completed', { jobId: job.id, txHash: job.data.txHash })
  );
  worker.on('failed', (job, err) =>
    logger.error('[TransactionQueue] Job failed', { jobId: job?.id, txHash: job?.data?.txHash, error: err.message })
  );

  logger.info('[TransactionQueue] Worker started', {
    concurrency: parseInt(process.env.TX_QUEUE_CONCURRENCY, 10) || 5,
  });

  return worker;
}

module.exports = { transactionQueue, enqueueTransaction, getJobStatus, startTransactionWorker, QUEUE_NAME };
