"use strict";

const mongoose = require("mongoose");
const { transactionManager } = require("./transactionManager");
const { logger } = require("../utils/logger");
const Student = require("../models/studentModel");
const Payment = require("../models/paymentModel");
const PaymentIntent = require("../models/paymentIntentModel");
const { sendPaymentWebhook } = require("./webhookService");

// ── Idempotency Cache ─────────────────────────────────────────────────────────
class IdempotencyCache {
  constructor(ttlMs = 60000) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  get(key) {
    if (!this.has(key)) return null;
    return this.cache.get(key).result;
  }

  set(key, result) {
    this.cache.set(key, { result, expiresAt: Date.now() + this.ttlMs });
    if (this.cache.size % 100 === 0) this.cleanup();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) this.cache.delete(key);
    }
  }
}

// ── Rate Limiter ───────────────────────────────────────────────────────────────
class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 1000;
    this.requests = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    let info = this.requests.get(key);

    if (!info || info.windowStart < windowStart) {
      info = { windowStart: now, count: 0 };
    }

    info.count++;
    this.requests.set(key, info);

    if (info.count > this.maxRequests) {
      return {
        allowed: false,
        retryAfterMs: this.windowMs - (now - info.windowStart),
      };
    }

    return { allowed: true, remaining: this.maxRequests - info.count };
  }

  cleanup() {
    const windowStart = Date.now() - this.windowMs * 2;
    for (const [key, info] of this.requests.entries()) {
      if (info.windowStart < windowStart) this.requests.delete(key);
    }
  }
}

// ── Concurrency Strategies ────────────────────────────────────────────────────
const CONCURRENCY_STRATEGY = {
  OPTIMISTIC: "optimistic",
  PESSIMISTIC: "pessimistic",
  SERIALIZABLE: "serializable",
};

// ── Payment Result ───────────────────────────────────────────────────────────
class PaymentProcessingResult {
  constructor(success, data = {}, error = null) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      success: this.success,
      data: this.data,
      error: this.error
        ? { message: this.error.message, code: this.error.code }
        : null,
      timestamp: this.timestamp,
    };
  }
}

// ── Main Processor ───────────────────────────────────────────────────────────
class ConcurrentPaymentProcessor {
  constructor(options = {}) {
    this.idempotencyCache = new IdempotencyCache(
      options.idempotencyTtlMs || 60000
    );
    this.rateLimiter = new RateLimiter({
      maxRequests: options.maxRequestsPerSecond || 100,
      windowMs: 1000,
    });
    this.defaultLockStrategy =
      options.lockStrategy || CONCURRENCY_STRATEGY.OPTIMISTIC;
    this.lockTimeoutMs = options.lockTimeoutMs || 30000;
    this.maxRetries = options.maxRetries || 3;
    this.maxQueueDepth = options.maxQueueDepth || 1000;
    this.activeCount = 0;
  }

  // ── Process Payment ───────────────────────────────────────────────────────
  async processPayment(paymentData, options = {}) {
    const {
      idempotencyKey,
      lockStrategy = this.defaultLockStrategy,
      studentId,
      amount,
      txHash,
    } = options;

    // Queue depth check
    if (this.activeCount >= this.maxQueueDepth) {
      return new PaymentProcessingResult(
        false,
        {},
        { message: "Queue is full", code: "QUEUE_FULL" }
      );
    }

    // Idempotency check
    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      logger.info("[PaymentProcessor] Returning cached result", {
        idempotencyKey,
      });
      return this.idempotencyCache.get(idempotencyKey);
    }

    // Rate limit check
    const rateLimitResult = this.rateLimiter.isAllowed(`payment:${studentId}`);
    if (!rateLimitResult.allowed) {
      return new PaymentProcessingResult(
        false,
        {},
        {
          message: "Rate limit exceeded",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfterMs: rateLimitResult.retryAfterMs,
        }
      );
    }

    this.activeCount++;
    try {
      // Duplicate transaction
      const existingPayment = await Payment.findOne({ txHash });
      if (existingPayment) {
        logger.warn("[PaymentProcessor] Duplicate transaction", { txHash });
        const result = new PaymentProcessingResult(true, {
          duplicate: true,
          existingPaymentId: existingPayment._id,
        });
        if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, result);
        return result;
      }

      // Choose lock strategy
      let processingResult;
      switch (lockStrategy) {
        case CONCURRENCY_STRATEGY.PESSIMISTIC:
          processingResult = await this.processWithPessimisticLock(
            studentId,
            amount,
            txHash,
            paymentData
          );
          break;
        case CONCURRENCY_STRATEGY.SERIALIZABLE:
          processingResult = await this.processWithSerializableTransaction(
            studentId,
            amount,
            txHash,
            paymentData
          );
          break;
        case CONCURRENCY_STRATEGY.OPTIMISTIC:
        default:
          processingResult = await this.processWithOptimisticLock(
            studentId,
            amount,
            txHash,
            paymentData
          );
      }

      // Cache success
      if (idempotencyKey && processingResult.success)
        this.idempotencyCache.set(idempotencyKey, processingResult);

      // Trigger webhook (non-blocking)
      this.triggerWebhook(
        studentId,
        amount,
        txHash,
        paymentData,
        processingResult
      );

      return processingResult;
    } catch (err) {
      return new PaymentProcessingResult(
        false,
        {},
        { message: err.message, code: "PROCESSING_ERROR" }
      );
    } finally {
      this.activeCount--;
    }
  }

  // ── Webhook trigger ───────────────────────────────────────────────────────
  async triggerWebhook(
    studentId,
    amount,
    txHash,
    paymentData,
    processingResult
  ) {
    if (processingResult.success && process.env.PAYMENT_WEBHOOK_URL) {
      try {
        const { payment } = processingResult.data;
        if (payment) {
          sendPaymentWebhook(process.env.PAYMENT_WEBHOOK_URL, {
            paymentId: payment._id,
            studentId,
            amount,
            currency: paymentData.currency || "USDC",
            status: "confirmed",
            txHash,
            timestamp: new Date().toISOString(),
          });
          logger.info("[Webhook] Triggered", { paymentId: payment._id });
        }
      } catch (err) {
        logger.error("[Webhook] Failed to trigger", {
          error: err.message,
          studentId,
          txHash,
        });
      }
    }
  }

  // ── Optimistic Lock ──────────────────────────────────────────────────────
  async processWithOptimisticLock(studentId, amount, txHash, paymentData) {
    let attempt = 0;

    while (attempt < this.maxRetries) {
      try {
        const student = await Student.findOne({ studentId });
        if (!student)
          return new PaymentProcessingResult(
            false,
            {},
            {
              message: `Student not found: ${studentId}`,
              code: "STUDENT_NOT_FOUND",
            }
          );

        const currentTotal = student.totalPaid || 0;
        const newTotal = currentTotal + amount;
        const newRemainingBalance = Math.max(0, student.feeAmount - newTotal);
        const isFeePaid = newTotal >= student.feeAmount;

        const updatedStudent = await Student.findOneAndUpdate(
          { studentId, totalPaid: currentTotal },
          {
            $set: {
              totalPaid: newTotal,
              remainingBalance: newRemainingBalance,
              feePaid: isFeePaid,
              lastPaymentAt: new Date(),
              lastPaymentHash: txHash,
            },
          },
          { new: true }
        );

        if (!updatedStudent) {
          attempt++;
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * Math.pow(2, attempt))
          );
          logger.warn("[PaymentProcessor] Optimistic lock conflict", {
            studentId,
            attempt,
          });
          continue;
        }

        const payment = await Payment.create({
          studentId,
          txHash,
          amount,
          feeAmount: student.feeAmount,
          feeValidationStatus: isFeePaid
            ? "valid"
            : amount < student.feeAmount
            ? "underpaid"
            : "overpaid",
          status: "confirmed",
          ...paymentData,
        });

        return new PaymentProcessingResult(true, {
          student,
          payment,
          newTotalPaid: newTotal,
          remainingBalance: newRemainingBalance,
          feePaid: isFeePaid,
        });
      } catch (error) {
        if (this.isRetryableError(error)) {
          attempt++;
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * Math.pow(2, attempt))
          );
          logger.warn("[PaymentProcessor] Retrying after error", {
            studentId,
            attempt,
            error: error.message,
          });
          continue;
        }
        throw error;
      }
    }

    return new PaymentProcessingResult(
      false,
      {},
      {
        message: `Failed after ${this.maxRetries} attempts`,
        code: "MAX_RETRIES_EXCEEDED",
      }
    );
  }

  // ── Pessimistic Lock ─────────────────────────────────────────────────────
  async processWithPessimisticLock(studentId, amount, txHash, paymentData) {
    return await transactionManager.withPessimisticLock(
      async () => {
        return await transactionManager.withTransaction(async (session) => {
          const student = await Student.findOne({ studentId }).session(session);
          if (!student) throw new Error(`Student not found: ${studentId}`);

          const currentTotal = student.totalPaid || 0;
          const newTotal = currentTotal + amount;
          const newRemainingBalance = Math.max(0, student.feeAmount - newTotal);
          const isFeePaid = newTotal >= student.feeAmount;

          student.totalPaid = newTotal;
          student.remainingBalance = newRemainingBalance;
          student.feePaid = isFeePaid;
          student.lastPaymentAt = new Date();
          student.lastPaymentHash = txHash;
          await student.save({ session });

          const payment = await Payment.create(
            [
              {
                studentId,
                txHash,
                amount,
                feeAmount: student.feeAmount,
                feeValidationStatus: isFeePaid
                  ? "valid"
                  : amount < student.feeAmount
                  ? "underpaid"
                  : "overpaid",
                status: "confirmed",
                ...paymentData,
              },
            ],
            { session }
          );

          return new PaymentProcessingResult(true, {
            student,
            payment: payment[0],
            newTotalPaid: newTotal,
            remainingBalance: newRemainingBalance,
            feePaid: isFeePaid,
          });
        });
      },
      {
        entityType: "Student",
        entityId: studentId,
        lockDurationMs: this.lockTimeoutMs,
      }
    );
  }

  // ── Serializable Transaction ─────────────────────────────────────────────
  async processWithSerializableTransaction(
    studentId,
    amount,
    txHash,
    paymentData
  ) {
    return await transactionManager.withTransaction(async (session) => {
      const student = await Student.findOne({ studentId }).session(session);
      if (!student) throw new Error(`Student not found: ${studentId}`);

      const currentTotal = student.totalPaid || 0;
      const newTotal = currentTotal + amount;
      const newRemainingBalance = Math.max(0, student.feeAmount - newTotal);
      const isFeePaid = newTotal >= student.feeAmount;

      const updateResult = await Student.updateOne(
        { studentId, totalPaid: currentTotal },
        {
          $set: {
            totalPaid: newTotal,
            remainingBalance: newRemainingBalance,
            feePaid: isFeePaid,
            lastPaymentAt: new Date(),
            lastPaymentHash: txHash,
          },
        },
        { session }
      );
      if (updateResult.matchedCount === 0)
        throw new Error(
          "Concurrent modification detected - transaction aborted"
        );

      const payment = await Payment.create(
        [
          {
            studentId,
            txHash,
            amount,
            feeAmount: student.feeAmount,
            feeValidationStatus: isFeePaid
              ? "valid"
              : amount < student.feeAmount
              ? "underpaid"
              : "overpaid",
            status: "confirmed",
            ...paymentData,
          },
        ],
        { session }
      );

      return new PaymentProcessingResult(true, {
        student,
        payment: payment[0],
        newTotalPaid: newTotal,
        remainingBalance: newRemainingBalance,
        feePaid: isFeePaid,
      });
    });
  }

  // ── Retryable Error Check ────────────────────────────────────────────────
  isRetryableError(error) {
    const retryablePatterns = [
      "TransientTransactionError",
      "WriteConflict",
      "LockTimeout",
      "WriteConflict:",
    ];
    return (
      error.hasErrorLabel?.("TransientTransactionError") ||
      error.code === 112 ||
      error.code === 189 ||
      retryablePatterns.some((p) => error.message?.includes(p))
    );
  }

  // ── Batch Processing ─────────────────────────────────────────────────────
  async processBatch(payments, options = {}) {
    const results = [];
    const concurrencyLimit = options.concurrencyLimit || 10;
    const queueFullRetryDelayMs = options.queueFullRetryDelayMs || 500;

    for (let i = 0; i < payments.length; i += concurrencyLimit) {
      const batch = payments.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.allSettled(
        batch.map(async (p) => {
          let result = await this.processPayment(p, options);
          while (result && result.error && result.error.code === "QUEUE_FULL") {
            logger.warn("[PaymentProcessor] Queue full, retrying after delay", {
              retryDelayMs: queueFullRetryDelayMs,
            });
            await new Promise((resolve) =>
              setTimeout(resolve, queueFullRetryDelayMs)
            );
            result = await this.processPayment(p, options);
          }
          return result;
        })
      );

      for (const res of batchResults) {
        if (res.status === "fulfilled")
          results.push({ success: true, data: res.value });
        else results.push({ success: false, error: res.reason.message });
      }
    }

    return {
      total: payments.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  // ── Stats ───────────────────────────────────────────────────────────────
  getStats() {
    return {
      idempotencyCacheSize: this.idempotencyCache.cache.size,
      rateLimiterStats: { trackedKeys: this.rateLimiter.requests.size },
      transactionManagerStats: {
        activeTransactions: transactionManager.getActiveTransactionCount(),
      },
      queueDepth: this.activeCount,
      maxQueueDepth: this.maxQueueDepth,
    };
  }
}

const config = require("../config");

// ── Singleton Instance ─────────────────────────────────────────────────────
const concurrentPaymentProcessor = new ConcurrentPaymentProcessor({
  idempotencyTtlMs: 60000,
  maxRequestsPerSecond: 100,
  lockStrategy: CONCURRENCY_STRATEGY.OPTIMISTIC,
  lockTimeoutMs: 30000,
  maxRetries: 3,
  maxQueueDepth: config.MAX_QUEUE_DEPTH,
});

module.exports = {
  concurrentPaymentProcessor,
  ConcurrentPaymentProcessor,
  PaymentProcessingResult,
  IdempotencyCache,
  RateLimiter,
  CONCURRENCY_STRATEGY,
};
