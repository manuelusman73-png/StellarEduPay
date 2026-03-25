/**
 * Transaction Retry Queue Integration Example
 * 
 * This example demonstrates how to integrate the BullMQ-based transaction
 * retry queue system into the existing Stellar payment processing pipeline.
 */

const bullMQRetryService = require('../services/bullMQRetryService');
const stellarService = require('../services/stellarService');
const { verifyTransaction, recordPayment } = require('../services/stellarService');

/**
 * Example 1: Enhanced payment processing with automatic retry
 */
async function processPaymentWithRetry(paymentData) {
  const { transactionHash, studentId, memo, amount } = paymentData;
  
  try {
    console.log(`[PaymentProcessor] Processing transaction ${transactionHash}`);
    
    // Step 1: Verify transaction on Stellar network
    const verification = await verifyTransaction(transactionHash);
    
    if (!verification) {
      console.error(`[PaymentProcessor] Verification failed for ${transactionHash}`);
      return {
        success: false,
        error: 'Verification returned null',
        errorCode: 'VERIFICATION_FAILED',
      };
    }
    
    // Step 2: Record the successful payment
    const paymentRecord = await recordPayment({
      studentId: verification.studentId || studentId,
      txHash: verification.hash,
      amount: verification.amount,
      feeAmount: verification.feeAmount,
      feeValidationStatus: verification.feeValidation.status,
      status: 'confirmed',
      memo: verification.memo || memo,
      confirmedAt: verification.date ? new Date(verification.date) : new Date(),
    });
    
    console.log(`[PaymentProcessor] Successfully processed ${transactionHash}`);
    
    return {
      success: true,
      paymentRecord,
      verification,
    };
    
  } catch (error) {
    console.error(`[PaymentProcessor] Error processing ${transactionHash}:`, error);
    
    // Queue the transaction for retry
    const queueResult = await bullMQRetryService.queueFailedTransaction(transactionHash, {
      studentId,
      memo,
      error,
      metadata: {
        paymentAmount: amount,
        paymentData,
        errorTime: new Date().toISOString(),
      },
    });
    
    console.log(`[PaymentProcessor] Queued ${transactionHash} for retry:`, queueResult);
    
    return {
      success: false,
      queued: true,
      queueResult,
      originalError: {
        message: error.message,
        code: error.code,
      },
    };
  }
}

/**
 * Example 2: Batch processing with retry queue integration
 */
async function processBatchPayments(payments) {
  const results = {
    processed: [],
    queued: [],
    failed: [],
  };
  
  for (const payment of payments) {
    const result = await processPaymentWithRetry(payment);
    
    if (result.success) {
      results.processed.push(result);
    } else if (result.queued) {
      results.queued.push(result);
    } else {
      results.failed.push(result);
    }
  }
  
  return {
    summary: {
      total: payments.length,
      processed: results.processed.length,
      queued: results.queued.length,
      failed: results.failed.length,
    },
    results,
  };
}

/**
 * Example 3: Webhook handler with retry queue
 */
async function handleStellarWebhook(webhookData) {
  const { type, transactionHash, data } = webhookData;
  
  console.log(`[WebhookHandler] Received ${type} for transaction ${transactionHash}`);
  
  try {
    switch (type) {
      case 'transaction_created':
        return await processPaymentWithRetry({
          transactionHash,
          studentId: data.memo,
          memo: data.memo,
          amount: data.amount,
          webhookData,
        });
        
      case 'transaction_failed':
        // Log the failure and potentially queue for investigation
        console.error(`[WebhookHandler] Transaction ${transactionHash} failed on Stellar`);
        return {
          success: false,
          reason: 'transaction_failed_on_network',
          transactionHash,
        };
        
      case 'transaction_confirmed':
        // Already processed, just log
        console.log(`[WebhookHandler] Transaction ${transactionHash} confirmed`);
        return {
          success: true,
          status: 'already_confirmed',
          transactionHash,
        };
        
      default:
        console.warn(`[WebhookHandler] Unknown webhook type: ${type}`);
        return {
          success: false,
          reason: 'unknown_webhook_type',
          type,
        };
    }
  } catch (error) {
    console.error(`[WebhookHandler] Error handling webhook:`, error);
    
    // Queue for retry on unexpected errors
    const queueResult = await bullMQRetryService.queueFailedTransaction(transactionHash, {
      studentId: data?.memo,
      error,
      metadata: {
        webhookType: type,
        webhookData,
      },
    });
    
    return {
      success: false,
      queued: true,
      queueResult,
    };
  }
}

/**
 * Example 4: Admin monitoring and management
 */
async function adminMonitoring() {
  console.log('[Admin] Starting monitoring check...');
  
  try {
    // Get comprehensive queue statistics
    const stats = await bullMQRetryService.getRetryQueueStats();
    
    console.log('[Admin] Queue Statistics:', {
      totalJobs: stats.bullmq.metrics.totalJobs,
      activeJobs: stats.bullmq.metrics.active,
      failedJobs: stats.bullmq.metrics.failed,
      deadLetteredJobs: stats.deadLetter.metrics?.failed || 0,
      queueHealth: stats.systemHealth.queueHealth,
    });
    
    // Check for issues
    const issues = [];
    
    if (stats.bullmq.metrics.failed > 100) {
      issues.push('High number of failed jobs - requires attention');
    }
    
    if (stats.deadLetter.metrics?.failed > 50) {
      issues.push('Dead-letter queue growing - manual review needed');
    }
    
    if (stats.systemHealth.queueHealth !== 'healthy') {
      issues.push('Queue health is not optimal - check Redis connection');
    }
    
    if (issues.length > 0) {
      console.warn('[Admin] Issues detected:', issues);
      // Send alerts or notifications here
      await sendAdminAlerts(issues);
    }
    
    // Get recent failed jobs for review
    const recentFailedJobs = await bullMQRetryService.getJobsByState('failed', 10);
    
    if (recentFailedJobs.length > 0) {
      console.log('[Admin] Recent failed jobs:');
      for (const job of recentFailedJobs) {
        console.log(`  - ${job.transactionHash} (${job.attemptsMade} attempts)`);
      }
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      stats,
      recentFailedJobs: recentFailedJobs.length,
    };
    
  } catch (error) {
    console.error('[Admin] Error during monitoring:', error);
    return {
      healthy: false,
      error: error.message,
    };
  }
}

/**
 * Example 5: Manual intervention and recovery
 */
async function manualIntervention() {
  console.log('[Admin] Starting manual intervention...');
  
  try {
    // Get all jobs in failed state
    const failedJobs = await bullMQRetryService.getJobsByState('failed', 50);
    
    console.log(`[Admin] Found ${failedJobs.length} failed jobs`);
    
    // Analyze failure patterns
    const failurePatterns = {};
    
    for (const job of failedJobs) {
      const txHash = job.data.transactionHash;
      // Group by transaction hash to identify patterns
      if (!failurePatterns[txHash]) {
        failurePatterns[txHash] = [];
      }
      failurePatterns[txHash].push(job);
    }
    
    // Identify transactions that have failed multiple times
    const problematicTransactions = Object.entries(failurePatterns)
      .filter(([txHash, jobs]) => jobs.length > 2)
      .map(([txHash, jobs]) => ({
        transactionHash: txHash,
        failureCount: jobs.length,
        jobs,
      }));
    
    if (problematicTransactions.length > 0) {
      console.warn('[Admin] Problematic transactions detected:', problematicTransactions);
      
      // Options for manual intervention:
      
      // Option 1: Retry specific job
      // await bullMQRetryService.retryJobImmediately(problematicTransactions[0].jobs[0].jobId);
      
      // Option 2: Remove stuck jobs
      // for (const job of problematicTransactions[0].jobs) {
      //   await bullMQRetryService.removeJob(job.jobId);
      // }
      
      // Option 3: Queue for manual investigation
      // These would need to be manually reviewed and processed
    }
    
    return {
      totalFailed: failedJobs.length,
      problematicTransactions: problematicTransactions.length,
      details: problematicTransactions,
    };
    
  } catch (error) {
    console.error('[Admin] Error during manual intervention:', error);
    throw error;
  }
}

/**
 * Example 6: Integration with payment controller
 */
async function enhancedPaymentController(txHash, paymentInfo) {
  try {
    // Use the new BullMQ-based retry system
    const result = await processPaymentWithRetry({
      transactionHash: txHash,
      studentId: paymentInfo.studentId,
      memo: paymentInfo.memo,
      amount: paymentInfo.amount,
    });
    
    if (result.success) {
      // Payment processed successfully
      return {
        status: 'success',
        data: result.paymentRecord,
      };
    } else if (result.queued) {
      // Payment queued for retry
      return {
        status: 'queued',
        message: 'Payment is being processed, please check back later',
        queueInfo: result.queueResult,
      };
    } else {
      // Payment processing failed permanently
      return {
        status: 'failed',
        error: result.error,
      };
    }
    
  } catch (error) {
    console.error('[PaymentController] Unexpected error:', error);
    return {
      status: 'error',
      error: error.message,
    };
  }
}

/**
 * Example 7: Testing the retry system
 */
async function testRetrySystem() {
  console.log('[Test] Starting retry system tests...');
  
  // Test 1: Queue a transaction for retry
  console.log('[Test 1] Testing transaction queuing...');
  const testTxHash = 'test-transaction-' + Date.now();
  
  const queueResult = await bullMQRetryService.queueFailedTransaction(testTxHash, {
    studentId: 'TEST001',
    memo: 'TEST001',
    error: new Error('Test error - network timeout'),
    metadata: {
      test: true,
      timestamp: Date.now(),
    },
  });
  
  console.log('[Test 1] Queue result:', queueResult);
  
  // Test 2: Get queue statistics
  console.log('[Test 2] Testing queue statistics...');
  const stats = await bullMQRetryService.getRetryQueueStats();
  console.log('[Test 2] Stats:', {
    totalJobs: stats.bullmq.metrics.totalJobs,
    health: stats.bullmq.health,
  });
  
  // Test 3: Get health status
  console.log('[Test 3] Testing health status...');
  const health = await bullMQRetryService.getHealthStatus();
  console.log('[Test 3] Health:', health);
  
  // Test 4: Error classification
  console.log('[Test 4] Testing error classification...');
  const testErrors = [
    new Error('Network timeout'),
    new Error('Invalid transaction'),
  ];
  testErrors[0].code = 'NETWORK_ERROR';
  testErrors[1].code = 'TX_FAILED';
  
  const classifications = testErrors.map(err => ({
    error: err.message,
    code: err.code,
    type: bullMQRetryService.classifyError(err),
  }));
  
  console.log('[Test 4] Classifications:', classifications);
  
  console.log('[Test] All tests completed');
  
  return {
    queueTest: queueResult,
    statsTest: stats,
    healthTest: health,
    classificationTest: classifications,
  };
}

/**
 * Helper function for sending admin alerts (placeholder)
 */
async function sendAdminAlerts(issues) {
  console.log('[Alert] Sending admin alerts:', issues);
  // Implementation would send to Slack, email, PagerDuty, etc.
}

// Export for use in other modules
module.exports = {
  processPaymentWithRetry,
  processBatchPayments,
  handleStellarWebhook,
  adminMonitoring,
  manualIntervention,
  enhancedPaymentController,
  testRetrySystem,
};
