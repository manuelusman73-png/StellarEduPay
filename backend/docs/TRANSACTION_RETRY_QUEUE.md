# Transaction Retry Queue System - Technical Documentation

## Overview

This document describes the comprehensive **Transaction Retry Queue** system implemented using BullMQ (Redis-based queue) for the Stellar payment processing backend. The system ensures failed Stellar transactions are automatically retried with exponential backoff, while maintaining idempotency and providing production-ready monitoring capabilities.

## Architecture

### System Components

1. **BullMQ Queue System** ([`src/queue/transactionRetryQueue.js`](src/queue/transactionRetryQueue.js:1))
   - Main retry queue for failed transactions
   - Dead-letter queue for permanently failed jobs
   - Redis-backed persistence and reliability

2. **Retry Service** ([`src/services/bullMQRetryService.js`](src/services/bullMQRetryService.js:1))
   - High-level API for queue operations
   - Automatic error classification
   - Integration with MongoDB tracking

3. **REST API** ([`src/routes/retryQueueRoutes.js`](src/routes/retryQueueRoutes.js:1))
   - Monitoring and administration endpoints
   - Manual job management
   - Health checks

## Key Features

### ✅ Implemented Requirements

1. **Track All Failed Transaction Jobs**
   - Persistent job storage in Redis
   - MongoDB tracking via `PendingVerification` model
   - Comprehensive job state management

2. **Queue Failed Jobs for Retry**
   - Automatic queuing on transaction failure
   - Manual queuing via API
   - Job deduplication to prevent duplicates

3. **Exponential Backoff Strategy**
   ```javascript
   // Backoff calculation: delay = min(initialDelay * multiplier^attempt, maxDelay)
   // Example: 60s → 120s → 240s → 480s → 960s → ... (capped at 1 hour)
   ```

4. **Maximum Retry Attempts**
   - Configurable via `MAX_RETRY_ATTEMPTS` (default: 10)
   - Jobs automatically moved to DLQ after exhausting retries

5. **Idempotency Guarantees**
   - Duplicate transaction hashes prevented
   - Transaction hash uniqueness enforced
   - Safe concurrent processing

6. **Persistent Job State**
   - Redis persistence for queue data
   - MongoDB backup for recovery
   - Job state survives server restarts

## Configuration

### Environment Variables

```env
# BullMQ Transaction Retry Queue Configuration
RETRIES_ENABLED=true                    # Enable/disable retry system
MAX_RETRY_ATTEMPTS=10                   # Maximum retry attempts before DLQ
INITIAL_RETRY_DELAY_MS=60000           # Initial delay (1 minute)
MAX_RETRY_DELAY_MS=3600000             # Maximum delay cap (1 hour)
RETRY_BACKOFF_MULTIPLIER=2             # Exponential backoff multiplier
DLQ_ENABLED=true                       # Enable dead-letter queue
DLQ_MAX_AGE_MS=604800000               # DLQ retention period (7 days)
QUEUE_CONCURRENCY=5                    # Worker concurrency
STELLAR_NETWORK_TIMEOUT_MS=10000      # Network timeout
```

### Redis Configuration

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

## How Retries Work

### Retry Flow

1. **Transaction Failure Detection**
   ```javascript
   try {
     await verifyTransaction(txHash);
   } catch (error) {
     // Error classification
     const errorType = classifyError(error);
     
     if (errorType === 'transient') {
       // Queue for retry
       await queueFailedTransaction(txHash, { error });
     } else {
       // Permanent error - move to DLQ immediately
       await moveToDeadLetterQueue(job, error);
     }
   }
   ```

2. **Job Queuing**
   - Job added with idempotency key: `tx-{transactionHash}`
   - Initial delay applied before first attempt
   - Job state tracked in both Redis and MongoDB

3. **Worker Processing**
   - Worker picks up job after delay
   - Idempotency check prevents duplicate processing
   - Transaction verification on Stellar network
   - Payment recording on success

4. **Retry Logic**
   ```javascript
   // Exponential backoff: 60s → 120s → 240s → 480s → 960s → ...
   const delay = Math.min(
     INITIAL_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempts - 1),
     MAX_RETRY_DELAY_MS
   );
   ```

5. **Success/Failure Handling**
   - **Success**: Job marked complete, payment recorded
   - **Transient Error**: Job retried with backoff
   - **Permanent Error**: Job moved to DLQ
   - **Max Attempts Reached**: Job moved to DLQ

### Error Classification

#### Transient Errors (Retryable)
- Network timeouts
- Connection refused
- Stellar Horizon unavailable
- Temporary service outages

#### Permanent Errors (Non-retryable)
- Invalid transaction hash
- Missing memo
- Invalid destination
- Unsupported asset
- Duplicate transaction

## Dead-Letter Queue (DLQ)

### Purpose
The DLQ stores jobs that have permanently failed or exhausted all retry attempts. These jobs require manual investigation.

### DLQ Job Structure
```javascript
{
  originalJobId: String,
  originalQueue: 'transaction-retry-queue',
  transactionHash: String,
  studentId: String,
  error: String,
  errorCode: String,
  failedAttempts: Number,
  failedAt: Date,
  originalJobData: Object
}
```

### Managing DLQ
```javascript
// Get DLQ statistics
const dlqStats = await getDLQStats();

// Get DLQ jobs
const jobs = await getJobsByState('failed');
const dlqJobs = jobs.filter(j => /* filter for DLQ */);
```

## Monitoring & Events

### Event Logging
Comprehensive event logging for all queue operations:

```javascript
// Event types logged:
- JOB_ADDED           // Job queued
- JOB_PROCESSING      // Job processing started
- JOB_COMPLETED       // Job succeeded
- JOB_FAILED_PERMANENT // Job moved to DLQ
- JOB_RETRY_SCHEDULED  // Job scheduled for retry
- JOB_IDEMPOTENT_SKIP  // Duplicate prevention
- WORKER_ERROR        // Worker error
- EVENT_STALLED       // Job stalled
```

### Queue Statistics API

```bash
# Get comprehensive stats
GET /api/retry-queue/stats

# Response
{
  "success": true,
  "data": {
    "bullmq": {
      "queue": "transaction-retry-queue",
      "health": "healthy",
      "metrics": {
        "totalJobs": 150,
        "successfulJobs": 120,
        "failedJobs": 10,
        "retriedJobs": 25,
        "deadLetteredJobs": 5
      }
    },
    "deadLetter": {
      "metrics": { "waiting": 3, "completed": 0, "failed": 2 }
    }
  }
}
```

### Health Checks

```bash
# Get health status
GET /api/retry-queue/health

# Response (healthy)
{
  "healthy": true,
  "status": "healthy",
  "details": {
    "redis": "connected",
    "workerConcurrency": 5,
    "queueSize": 150,
    "failedJobs": 10
  }
}
```

## API Reference

### Queue Management

#### `GET /api/retry-queue/stats`
Get comprehensive queue statistics.

#### `GET /api/retry-queue/health`
Get system health status.

#### `POST /api/retry-queue/pause`
Pause queue processing.

#### `POST /api/retry-queue/resume`
Resume queue processing.

### Job Management

#### `GET /api/retry-queue/jobs/:jobId`
Get specific job details.

#### `GET /api/retry-queue/jobs/state/:state`
Get jobs by state (`waiting`, `active`, `completed`, `failed`, `delayed`).

#### `POST /api/retry-queue/jobs/:jobId/retry`
Manually retry a failed job.

#### `DELETE /api/retry-queue/jobs/:jobId`
Remove a job from the queue.

### Manual Transaction Queuing

#### `POST /api/retry-queue/queue`
Manually queue a transaction for retry.

**Request Body:**
```json
{
  "transactionHash": "abc123...",
  "studentId": "STU001",
  "memo": "STU001",
  "error": {
    "message": "Stellar network timeout"
  },
  "metadata": {}
}
```

## Usage Examples

### 1. Automatic Retry on Transaction Failure

```javascript
const { queueFailedTransaction } = require('./services/bullMQRetryService');

async function processPayment(paymentData) {
  try {
    // Verify transaction on Stellar
    const result = await verifyTransaction(paymentData.txHash);
    
    // Record successful payment
    await recordPayment(result);
    
    return { success: true, result };
    
  } catch (error) {
    // Queue for retry on failure
    const queueResult = await queueFailedTransaction(paymentData.txHash, {
      studentId: paymentData.studentId,
      memo: paymentData.memo,
      error,
      metadata: {
        paymentAmount: paymentData.amount,
        timestamp: Date.now()
      }
    });
    
    console.log('Transaction queued for retry:', queueResult);
    return { success: false, queued: true, queueResult };
  }
}
```

### 2. Integration with Existing Payment Processing

```javascript
const stellarService = require('./services/stellarService');
const bullMQRetryService = require('./services/bullMQRetryService');

// In payment controller
async function handleWebhookPayment(txHash, paymentData) {
  try {
    const verification = await stellarService.verifyTransaction(txHash);
    
    if (verification) {
      await stellarService.recordPayment({
        studentId: verification.studentId,
        txHash: verification.hash,
        amount: verification.amount,
        // ... other fields
      });
      
      return { status: 'processed', verification };
    }
    
    throw new Error('Transaction verification failed');
    
  } catch (error) {
    // Use BullMQ retry service
    const result = await bullMQRetryService.queueFailedTransaction(txHash, {
      studentId: paymentData.studentId,
      error,
      metadata: {
        webhookData: paymentData
      }
    });
    
    return { status: 'queued_for_retry', result };
  }
}
```

### 3. Monitoring and Admin Operations

```javascript
// Get queue health in monitoring system
async function checkSystemHealth() {
  const health = await bullMQRetryService.getHealthStatus();
  
  if (!health.healthy) {
    // Alert operations team
    await sendAlert({
      title: 'Retry Queue Health Issue',
      details: health.details
    });
  }
  
  return health;
}

// Get jobs stuck in failed state
async function getFailedTransactions() {
  const failedJobs = await bullMQRetryService.getJobsByState('failed', 100);
  
  return failedJobs.map(job => ({
    transactionHash: job.data.transactionHash,
    failedAttempts: job.attemptsMade,
    failedReason: job.failedReason,
    createdAt: job.createdAt
  }));
}

// Manual retry for specific transaction
async function manualRetryTransaction(txHash) {
  const jobs = await getJobsByState('failed');
  const job = jobs.find(j => j.transactionHash === txHash);
  
  if (job) {
    return await retryJobImmediately(job.jobId);
  }
  
  return { success: false, message: 'Job not found' };
}
```

### 4. Cleanup and Maintenance

```javascript
// Clean up old completed jobs (run periodically)
async function cleanupOldJobs() {
  const oneDay = 24 * 60 * 60 * 1000; // 1 day
  const result = await bullMQRetryService.cleanupOldJobs(oneDay);
  
  console.log(`Cleaned up ${result.cleaned} old jobs`);
  return result;
}

// Get DLQ statistics for reporting
async function getDLQReport() {
  const stats = await bullMQRetryService.getRetryQueueStats();
  const dlqStats = stats.deadLetter;
  
  return {
    totalDeadLettered: dlqStats.metrics.failed,
    recentFailures: dlqStats.metrics.failed > 0,
    requiresReview: dlqStats.metrics.failed > 10
  };
}
```

## Production Considerations

### Scalability

1. **Multiple Workers**: Can run multiple worker instances for parallel processing
2. **Queue Partitioning**: Jobs can be partitioned by priority or transaction type
3. **Redis Clustering**: Supports Redis Cluster for high availability
4. **Horizontal Scaling**: Add more workers as needed

### Reliability

1. **Job Persistence**: Jobs survive Redis and application restarts
2. **Idempotency**: Prevents duplicate processing
3. **Graceful Shutdown**: Proper cleanup on application termination
4. **Error Handling**: Comprehensive error classification and handling

### Monitoring

1. **Real-time Metrics**: Queue stats updated in real-time
2. **Event Logging**: All operations logged for debugging
3. **Health Checks**: Automated health monitoring
4. **Alerting**: Can integrate with alerting systems

### Security

1. **Job Validation**: Input validation on all API endpoints
2. **Error Sanitization**: Error messages sanitized before storage
3. **Access Control**: Admin endpoints should be protected

## Troubleshooting

### Common Issues

#### Job Stuck in Waiting State
**Symptoms**: Jobs remain in waiting state indefinitely

**Solutions**:
1. Check Redis connection: `redis-cli ping`
2. Check worker logs for errors
3. Verify queue is not paused
4. Check worker concurrency setting

#### High DLQ Volume
**Symptoms**: Many jobs moving to DLQ

**Solutions**:
1. Review DLQ job errors: `GET /api/retry-queue/jobs/state/failed`
2. Check Stellar network status
3. Adjust retry configuration
4. Review error classification logic

#### Memory Issues
**Symptoms**: Increasing memory usage

**Solutions**:
1. Adjust job retention settings
2. Implement cleanup routine
3. Monitor event log size
4. Use `removeOnComplete` options

### Debugging Tips

```bash
# Check Redis queue state
redis-cli LRANGE bullmq:transaction-retry-queue:wait 0 -1

# Get job details
redis-cli HGETALL bullmq:job:tx-abc123...

# Check worker logs
tail -f logs/retry-queue.log

# Monitor queue metrics
watch -n 5 'curl -s http://localhost:5000/api/retry-queue/stats'
```

## Migration from MongoDB-based Retry

The existing MongoDB-based retry service (`src/services/retryService.js`) can be gradually replaced:

1. **Phase 1**: Enable BullMQ alongside existing service
2. **Phase 2**: Route new failures to BullMQ
3. **Phase 3**: Migrate existing pending verifications to BullMQ
4. **Phase 4**: Disable MongoDB polling retry

```javascript
// Migration example
async function migratePendingVerifications() {
  const pending = await PendingVerification.find({
    status: 'pending',
    // Only migrate old MongoDB-based pending items
  });
  
  for (const item of pending) {
    await queueFailedTransaction(item.txHash, {
      studentId: item.studentId,
      error: new Error(item.lastError),
      metadata: {
        migratedFromMongo: true,
        originalAttempts: item.attempts
      }
    });
  }
}
```

## Best Practices

1. **Always handle errors**: Don't let errors propagate unhandled
2. **Use idempotency keys**: Prevent duplicate processing
3. **Monitor DLQ**: Regular review prevents issues
4. **Configure appropriate retries**: Balance between retry attempts and user experience
5. **Log extensively**: Good logging aids debugging
6. **Test failure scenarios**: Simulate network failures during testing
7. **Set appropriate timeouts**: Prevent jobs from hanging
8. **Use health checks**: Implement automated monitoring

## Performance Tuning

```javascript
// Optimal settings for high-volume processing
const optimalConfig = {
  worker: {
    concurrency: 10,           // Parallel job processing
    maxStalledCount: 2,         // Max retries before considered stalled
    stalledInterval: 30000,     // Check for stalled jobs
  },
  queue: {
    removeOnComplete: {
      age: 3600,               // Keep completed jobs for 1 hour
      count: 5000              // Keep last 5000 jobs
    },
  },
  retry: {
    maxAttempts: 5,            // Reduce for faster failure detection
    backoff: {
      type: 'exponential',
      delay: 30000,            // Start with 30s delay
    }
  }
};
```

## Conclusion

This BullMQ-based Transaction Retry Queue provides a robust, scalable, and production-ready solution for handling failed Stellar transactions. The system offers:

- ✅ Automatic retry with exponential backoff
- ✅ Dead-letter queue for failed jobs  
- ✅ Comprehensive monitoring and logging
- ✅ Idempotency guarantees
- ✅ Easy integration with existing services
- ✅ Admin API for manual intervention
- ✅ Configurable via environment variables
- ✅ Production-ready architecture

The system is designed to work seamlessly with the existing Stellar payment processing pipeline while providing superior reliability and observability compared to the previous MongoDB-based polling approach.
