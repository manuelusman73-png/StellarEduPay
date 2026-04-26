# Requirements Document

## Introduction

`POST /api/payments/sync` currently has no idempotency protection. When two sync requests arrive simultaneously — for example, from the background poller (`transactionService.js`) and a manual trigger — both can fetch the same transactions from Horizon and begin processing them concurrently. The `txHash` unique index on the `Payment` collection prevents duplicate documents from being persisted, but the processing side-effects (fee validation, student status update, `PaymentIntent` status change) may execute twice before the duplicate-key error is thrown.

This feature introduces a per-transaction distributed lock backed by MongoDB so that each Stellar transaction is processed exactly once, regardless of how many concurrent sync calls arrive. No new infrastructure dependency (e.g. Redis) is introduced; the lock collection reuses the existing MongoDB connection.

## Glossary

- **SyncLock**: A MongoDB document that represents an in-progress or recently-completed processing lock for a single Stellar transaction, keyed by `txHash`.
- **Lock TTL**: The maximum duration a `SyncLock` document is allowed to exist before MongoDB automatically removes it, preventing deadlocks caused by a crashed process.
- **txHash**: The unique 64-character hexadecimal Stellar transaction hash used as the idempotency key.
- **Sync**: The operation performed by `syncPayments()` in `stellarService.js` that fetches recent Stellar transactions and records new payments.
- **Background Poller**: The `setInterval`-based loop in `transactionService.js` that calls `syncPayments()` on a configurable interval.
- **Processing Side-Effects**: The sequence of writes that occur when a new payment is recorded: `Payment.create`, `Student.findOneAndUpdate`, and `PaymentIntent.findByIdAndUpdate`.
- **SyncLockModel**: The Mongoose model that manages `SyncLock` documents in MongoDB.

## Requirements

### Requirement 1: Per-Transaction Idempotency Lock

**User Story:** As a system operator, I want each Stellar transaction to be processed by at most one sync worker at a time, so that concurrent sync calls cannot trigger duplicate fee validation or student status updates.

#### Acceptance Criteria

1. WHEN `syncPayments()` begins processing a transaction, THE SyncLockModel SHALL attempt to acquire a lock document keyed by `txHash` using an atomic `findOneAndUpdate` with `upsert: true` and `setOnInsert`.
2. WHEN a lock document for a given `txHash` already exists, THE SyncLockModel SHALL return the existing document without overwriting it, causing the competing worker to skip that transaction.
3. WHEN a lock is successfully acquired for a `txHash`, THE Sync SHALL proceed to execute all processing side-effects for that transaction exactly once.
4. WHEN a lock acquisition attempt fails because the document already exists, THE Sync SHALL skip that transaction without error and continue processing the remaining transactions in the batch.
5. THE SyncLockModel SHALL enforce a TTL index on the `expiresAt` field so that MongoDB automatically removes stale lock documents after the configured lock duration elapses.

### Requirement 2: Lock TTL Configuration

**User Story:** As a system operator, I want the lock TTL to be configurable via an environment variable, so that I can tune deadlock recovery time without redeploying code.

#### Acceptance Criteria

1. THE Config SHALL read a `SYNC_LOCK_TTL_MS` environment variable and default to `30000` (30 seconds) when the variable is absent.
2. WHEN `SYNC_LOCK_TTL_MS` is set to a positive integer, THE SyncLockModel SHALL set the `expiresAt` field on each new lock document to `Date.now() + SYNC_LOCK_TTL_MS`.
3. THE SyncLockModel SHALL define a MongoDB TTL index on `expiresAt` with `expireAfterSeconds: 0` so that the database removes expired documents automatically.
4. WHEN a process crashes while holding a lock, THE SyncLockModel SHALL allow the lock to expire naturally via the TTL index, enabling subsequent sync calls to reprocess the transaction after the TTL elapses.

### Requirement 3: Existing Duplicate-Key Guard Preserved

**User Story:** As a developer, I want the existing `txHash` unique index on the `Payment` collection to remain as a last-resort guard, so that the system has defence-in-depth against duplicate payment records even if the lock layer is bypassed.

#### Acceptance Criteria

1. THE Payment collection SHALL retain the unique index on `txHash` as a secondary idempotency guard.
2. WHEN `Payment.create` throws a duplicate-key error (MongoDB error code `11000`), THE Sync SHALL catch the error, log it, and continue processing remaining transactions without propagating the error.
3. WHEN both the lock layer and the unique index are present, THE Sync SHALL rely on the lock as the primary guard and treat the unique index error as a non-fatal fallback.

### Requirement 4: Testability Without Real Stellar Network

**User Story:** As a developer, I want the idempotency lock logic to be testable with mocked dependencies, so that CI can verify concurrent-sync behaviour without connecting to the Stellar testnet.

#### Acceptance Criteria

1. THE SyncLockModel SHALL be injectable as a dependency or mockable via Jest's module mocking system, consistent with how `Payment`, `Student`, and `PaymentIntent` are mocked in existing tests.
2. WHEN tests simulate two concurrent calls to `syncPayments()` for the same `txHash`, THE Sync SHALL invoke the processing side-effects exactly once across both calls.
3. WHEN tests simulate a lock that has already been acquired, THE Sync SHALL skip processing for that transaction and produce no additional writes to the `Payment` collection.

### Requirement 5: Environment Variable Documentation

**User Story:** As a developer onboarding to the project, I want all new environment variables documented in `backend/.env.example`, so that I can configure the service correctly from the start.

#### Acceptance Criteria

1. THE `backend/.env.example` file SHALL include an entry for `SYNC_LOCK_TTL_MS` with a comment explaining its purpose and the default value.
2. THE `backend/src/config/index.js` file SHALL export `SYNC_LOCK_TTL_MS` alongside the existing configuration values.
