# Implementation Plan: sync-idempotency-lock

## Overview

Introduce a MongoDB-backed per-transaction idempotency lock into `syncPayments()` so that concurrent sync calls process each Stellar transaction exactly once. The work is split into: (1) the new `SyncLock` model and `acquireLock` helper, (2) wiring the lock into `syncPayments()`, (3) config + env-var plumbing, and (4) tests.

## Tasks

- [ ] 1. Create the SyncLock Mongoose model
  - Create `backend/src/models/syncLockModel.js` with a schema containing `txHash` (String, unique), `lockedAt` (Date), and `expiresAt` (Date)
  - Add a TTL index: `syncLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })`
  - Export an `acquireLock(txHash, ttlMs)` function that performs `SyncLock.findOneAndUpdate({ txHash }, { $setOnInsert: { txHash, lockedAt, expiresAt } }, { upsert: true, new: false, rawResult: true })` and returns `true` when `result.lastErrorObject?.upserted != null`, `false` otherwise
  - _Requirements: 1.1, 1.2, 1.5, 2.2, 2.3_

  - [ ]* 1.1 Write unit tests for acquireLock
    - Test that the first call for a new `txHash` returns `true`
    - Test that a second call for the same `txHash` returns `false`
    - Test that `expiresAt` is set to approximately `Date.now() + ttlMs`
    - Test that the TTL index is declared on the schema
    - _Requirements: 1.1, 1.2, 2.2, 2.3_

  - [ ]* 1.2 Write property test for lock mutual exclusion
    - **Property 1: Lock acquisition is mutually exclusive**
    - **Validates: Requirements 1.1, 1.2**
    - Use `fast-check` to generate random `txHash` strings; simulate two concurrent `acquireLock` calls; assert exactly one returns `true`
    - Tag: `Feature: sync-idempotency-lock, Property 1: Lock acquisition is mutually exclusive`

- [ ] 2. Add SYNC_LOCK_TTL_MS to config
  - In `backend/src/config/index.js`, read `process.env.SYNC_LOCK_TTL_MS` and parse it as an integer, defaulting to `30000`
  - Export `SYNC_LOCK_TTL_MS` in the frozen config object
  - Add an entry to `backend/.env.example`:
    ```
    # Lock TTL for per-transaction sync idempotency (ms, default: 30000)
    SYNC_LOCK_TTL_MS=30000
    ```
  - _Requirements: 2.1, 5.1, 5.2_

  - [ ]* 2.1 Write unit tests for config
    - Test that `SYNC_LOCK_TTL_MS` defaults to `30000` when the env var is absent
    - Test that it reads the env var value when set
    - _Requirements: 2.1_

- [ ] 3. Wire acquireLock into syncPayments()
  - In `backend/src/services/stellarService.js`, import `acquireLock` from `syncLockModel` and `SYNC_LOCK_TTL_MS` from config
  - At the top of the per-transaction loop (before the existing `Payment.findOne` existence check), call `acquireLock(tx.hash, SYNC_LOCK_TTL_MS)`; if it returns `false`, `continue` to the next transaction
  - Wrap the `Payment.create` call in a try/catch that catches `err.code === 11000`, logs a warning, and `continue`s — preserving the existing defence-in-depth guard
  - _Requirements: 1.1, 1.3, 1.4, 3.2, 3.3_

  - [ ]* 3.1 Write property test for concurrent sync deduplication
    - **Property 2: Concurrent sync produces exactly one Payment record**
    - **Validates: Requirements 1.3, 1.4, 4.2**
    - Use `fast-check` to generate random transaction batches; simulate N concurrent `syncPayments()` calls; assert `Payment.create` is called exactly once per unique `txHash`
    - Tag: `Feature: sync-idempotency-lock, Property 2: Concurrent sync produces exactly one Payment record`

  - [ ]* 3.2 Write property test for lock-skip behaviour
    - **Property 3: Lock skip leaves Payment collection unchanged**
    - **Validates: Requirements 1.4, 4.3**
    - Pre-seed a `SyncLock` document for a `txHash`; call `syncPayments()` with that transaction in the batch; assert `Payment.create` is never called for that `txHash`
    - Tag: `Feature: sync-idempotency-lock, Property 3: Lock skip leaves Payment collection unchanged`

  - [ ]* 3.3 Write property test for duplicate-key non-fatal handling
    - **Property 5: Duplicate-key error is non-fatal**
    - **Validates: Requirements 3.2**
    - Simulate `Payment.create` throwing `{ code: 11000 }`; assert `syncPayments()` resolves without throwing and continues processing subsequent transactions
    - Tag: `Feature: sync-idempotency-lock, Property 5: Duplicate-key error is non-fatal`

- [ ] 4. Checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Write integration test for concurrent sync
  - In `tests/stellar.test.js` (or a new `tests/syncLock.test.js`), add a test that:
    - Mocks `SyncLock.findOneAndUpdate` to simulate the first call inserting (lock acquired) and the second call returning an existing document (lock not acquired)
    - Calls `syncPayments()` twice concurrently via `Promise.all`
    - Asserts `Payment.create` was called exactly once
  - _Requirements: 4.2, 1.3_

  - [ ]* 5.1 Write property test for TTL expiry re-acquisition
    - **Property 4: TTL expiry allows reprocessing after crash**
    - **Validates: Requirements 2.4**
    - Generate an expired lock document (`expiresAt` in the past, simulated by having `findOneAndUpdate` return no upserted doc on first call then behave as if absent); assert `acquireLock` returns `true` on the subsequent call
    - Tag: `Feature: sync-idempotency-lock, Property 4: TTL expiry allows reprocessing after crash`

- [ ] 6. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `fast-check` should be added as a dev dependency: `npm install --save-dev fast-check`
- Each property test must run a minimum of 100 iterations (`fc.assert(..., { numRuns: 100 })`)
- The `SyncLock` collection does not need to be pre-created; Mongoose will create it on first write
- No changes to existing API routes or response shapes are required
