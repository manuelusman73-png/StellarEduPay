# Architecture

StellarEduPay is a three-tier application: a Next.js frontend, a Node.js/Express backend, and the Stellar blockchain as the payment ledger. MongoDB stores student records and payment metadata; the Stellar Horizon API is the authoritative source for transaction data.

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Component Diagram](#component-diagram)
- [Data Flow: Payment Initiation to Confirmation](#data-flow-payment-initiation-to-confirmation)
- [Backend Services](#backend-services)
- [Controllers](#controllers)
- [Middleware](#middleware)
- [MongoDB Schema Relationships](#mongodb-schema-relationships)
- [Background Workers](#background-workers)
- [Multi-School Tenancy](#multi-school-tenancy)
- [Error Handling and Resilience](#error-handling-and-resilience)

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Parent / Admin Browser                    │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Next.js Frontend (React)                    │
│  PaymentForm · VerifyPayment · Dashboard · Reports          │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Express.js Backend (Node.js)                    │
│                                                             │
│  Routes → Controllers → Services → Models                   │
│                                                             │
│  Background workers:                                        │
│    transactionService  (polling)                            │
│    retryService        (outage recovery)                    │
│    consistencyScheduler (drift detection)                   │
│    reminderService     (fee reminders)                      │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────┐    ┌─────────────────────────────────┐
│       MongoDB        │    │     Stellar Horizon API          │
│                      │    │                                 │
│  School             │    │  Transaction ledger             │
│  Student            │    │  Account operations             │
│  Payment            │    │  Ledger sequence                │
│  PaymentIntent      │    │                                 │
│  FeeStructure       │    │  testnet.stellar.org (dev)      │
│  PendingVerification│    │  horizon.stellar.org (prod)     │
│  Dispute            │    └─────────────────────────────────┘
└──────────────────────┘
```

---

## Component Diagram

```
frontend/src/
├── pages/
│   ├── pay-fees.jsx        ← PaymentForm + VerifyPayment
│   ├── dashboard.jsx       ← student list, sync button
│   └── reports.jsx         ← report download
├── components/
│   ├── PaymentForm.jsx     ← student lookup + instructions + history
│   ├── VerifyPayment.jsx   ← tx hash verification UI
│   └── TransactionCard.jsx ← single payment display + dispute flag
└── services/
    └── api.js              ← axios client, all API calls

backend/src/
├── app.js                  ← Express setup, route mounting, startup
├── config/
│   ├── index.js            ← env var loading and validation
│   └── stellarConfig.js    ← Horizon server, accepted assets
├── routes/                 ← thin route files, map HTTP → controller
├── controllers/            ← request/response handling
├── services/               ← business logic (no HTTP concerns)
├── models/                 ← Mongoose schemas
├── middleware/             ← auth, validation, rate limiting, idempotency
└── utils/                  ← paymentLimits, withStellarRetry, logger
```

---

## Data Flow: Payment Initiation to Confirmation

### Step 1 — Fee structure setup (admin, one-time)

```
POST /api/fees
  → feeController.createFeeStructure
  → FeeStructure.create({ schoolId, className, feeAmount, academicYear })
```

### Step 2 — Student registration (admin)

```
POST /api/students
  → studentController.createStudent
  → FeeStructure.findOne({ schoolId, className })   ← auto-assigns feeAmount
  → Student.create({ schoolId, studentId, name, class, feeAmount })
```

### Step 3 — Payment instructions (parent)

```
GET /api/payments/instructions/:studentId
  → paymentController.getPaymentInstructions
  → PaymentIntent.create({ schoolId, studentId, memo: studentId, amount, expiresAt })
  → returns { walletAddress, memo, acceptedAssets, paymentLimits }
```

The parent's Stellar wallet sends XLM or USDC to the school wallet address with the student ID as the transaction memo.

### Step 4 — Blockchain sync (background or manual)

```
POST /api/payments/sync  (or automatic via transactionService every 30s)
  → stellarService.syncPaymentsForSchool(school)
      │
      ├─ Horizon: fetch latest 200 txs for school wallet (newest first)
      │
      ├─ For each tx:
      │   ├─ Skip if txHash already in Payment collection
      │   ├─ extractValidPayment: check tx.successful, memo present,
      │   │   payment op targets school wallet, asset is accepted
      │   ├─ Match memo → PaymentIntent (schoolId + memo + status:pending)
      │   ├─ Validate amount against global limits (MIN/MAX_PAYMENT_AMOUNT)
      │   ├─ Calculate cumulative payment total for partial payments
      │   ├─ detectMemoCollision: flag if same memo used by different sender
      │   ├─ checkConfirmationStatus: compare tx ledger vs latest ledger
      │   └─ Payment.create(...)
      │
      └─ If confirmed + not suspicious:
          ├─ Student.update({ totalPaid, feePaid })
          └─ PaymentIntent.update({ status: 'completed' })
```

### Step 5 — Manual verification (parent)

```
POST /api/payments/verify  { txHash }
  → paymentController.verifyPayment
  → stellarService.verifyTransaction(txHash, walletAddress)
      ├─ Fetch tx from Horizon
      ├─ Validate: successful, memo present, correct destination, accepted asset
      ├─ Compare amount against student fee
      └─ Return { hash, memo, amount, feeValidation, date, networkFee }
```

### Full flow summary

```
Admin creates fee  →  Admin registers student  →  Parent gets instructions
                                                          │
                                              Parent sends XLM/USDC on Stellar
                                                          │
                                              ┌───────────▼────────────┐
                                              │  Stellar Blockchain     │
                                              │  (3-5 second finality) │
                                              └───────────┬────────────┘
                                                          │
                                              Background poller (30s interval)
                                              or POST /api/payments/sync
                                                          │
                                              stellarService.syncPaymentsForSchool
                                                          │
                                              ┌───────────▼────────────┐
                                              │  MongoDB               │
                                              │  Payment created       │
                                              │  Student.feePaid=true  │
                                              └────────────────────────┘
```

---

## Backend Services

### `stellarService.js`

The core blockchain integration layer. All Horizon API calls go through here.

| Function | Purpose |
|---|---|
| `syncPaymentsForSchool(school)` | Fetches and processes recent transactions for one school wallet |
| `verifyTransaction(txHash, walletAddress)` | Validates a single transaction by hash; returns structured result |
| `extractValidPayment(tx, walletAddress)` | Checks tx success, memo, payment op, and asset acceptance |
| `validatePaymentAgainstFee(amount, fee)` | Returns `valid` / `overpaid` / `underpaid` with excess amount |
| `detectMemoCollision(...)` | Flags if the same memo was used by a different sender within 24h |
| `detectAbnormalPatterns(...)` | Flags velocity abuse (>3 txs in 10 min) and unusual amounts |
| `checkConfirmationStatus(txLedger)` | Compares tx ledger against latest ledger sequence |
| `finalizeConfirmedPayments(schoolId)` | Promotes `pending_confirmation` payments once threshold is met |
| `recordPayment(data)` | Persists a payment, enforces uniqueness on `txHash` |

All Horizon calls are wrapped in `withStellarRetry` (exponential backoff, retries on 429/5xx/network errors).

### `transactionService.js`

Background polling service. Runs on startup and calls `syncPaymentsForSchool` for every active school in parallel on a fixed interval (`POLL_INTERVAL_MS`, default 30s).

```
startPolling()
  └─ setInterval(async () => {
       schools = School.find({ isActive: true })
       Promise.allSettled(schools.map(syncPaymentsForSchool))
     }, 30_000)
```

Errors for individual schools are logged but do not stop polling for other schools.

### `retryService.js`

Outage recovery worker. When a Stellar network call fails with a transient error, the transaction hash is stored as a `PendingVerification` document. This service runs on `RETRY_INTERVAL_MS` (default 60s), checks network reachability, and re-attempts verification with exponential backoff (1m → 2m → 4m … capped at 60m).

Permanent errors (`TX_FAILED`, `MISSING_MEMO`, `INVALID_DESTINATION`, `UNSUPPORTED_ASSET`, `DUPLICATE_TX`) are moved to `dead_letter` status immediately without retrying.

### `consistencyService.js`

Drift detection. Compares Payment documents in MongoDB against the last 200 on-chain transactions and reports mismatches:

- `missing_on_chain` — payment in DB but not found on Stellar
- `amount_mismatch` — DB amount differs from on-chain amount
- `student_mismatch` — DB `studentId` doesn't match the transaction memo

Triggered via `GET /api/consistency` or the `consistencyScheduler` background job.

### `reminderService.js`

Fee reminder scheduler. Finds students with unpaid fees and a `parentEmail`, respects `reminderCooldownHours` and `reminderMaxCount` per student, and sends emails via nodemailer (SMTP configured in `.env`).

---

## Controllers

| Controller | Routes | Responsibility |
|---|---|---|
| `paymentController` | `/api/payments/*` | Instructions, verify, sync, payment history |
| `studentController` | `/api/students/*` | CRUD, auto fee assignment from FeeStructure |
| `feeController` | `/api/fees/*` | Fee structure CRUD |
| `schoolController` | `/api/schools/*` | School registration and management |
| `reportController` | `/api/reports/*` | Payment reports, CSV export |
| `disputeController` | `/api/disputes/*` | Flag and resolve payment disputes |
| `healthController` | `/health` | Liveness check (used by Docker HEALTHCHECK) |
| `consistencyController` | `/api/consistency` | On-demand consistency check |

Controllers are thin — they validate input, call a service, and return a response. Business logic lives in services.

---

## Middleware

| Middleware | Purpose |
|---|---|
| `auth.js` | JWT verification for admin routes |
| `validate.js` | Joi schema validation on request bodies |
| `schoolContext.js` | Resolves `X-School-ID` or `X-School-Slug` header to a School document |
| `idempotency.js` | Deduplicates requests using `Idempotency-Key` header |
| `rateLimiter.js` | Per-IP rate limiting |
| `concurrentRequestHandler.js` | Circuit breaker + request queue for Horizon call bursts |
| `errorHandler.js` | Maps error codes to HTTP status codes, formats JSON error responses |
| `requestLogger.js` | Structured request/response logging |

---

## MongoDB Schema Relationships

```
School
  │  schoolId (PK)
  │  stellarAddress
  │  slug
  │
  ├──< FeeStructure
  │      schoolId (FK)
  │      className  ─────────────────────────────┐
  │      feeAmount                               │
  │                                              │ auto-assigned on student create
  ├──< Student                                   │
  │      schoolId (FK)                           │
  │      studentId (unique per school)           │
  │      class ─────────────────────────────────┘
  │      feeAmount
  │      feePaid
  │      totalPaid
  │
  ├──< PaymentIntent
  │      schoolId (FK)
  │      studentId
  │      memo (= studentId, unique)
  │      status: pending | completed | expired
  │      expiresAt
  │
  ├──< Payment
  │      schoolId (FK)
  │      studentId
  │      txHash (globally unique)
  │      amount
  │      feeValidationStatus: valid | underpaid | overpaid | unknown
  │      confirmationStatus: pending_confirmation | confirmed | failed
  │      isSuspicious
  │      confirmedAt
  │
  └──< PendingVerification
         schoolId (FK)
         txHash
         status: pending | processing | resolved | dead_letter
         attempts
         nextRetryAt
```

### Key constraints

- `txHash` is globally unique across all schools — a transaction can only be recorded once.
- `studentId` is unique per school (`{ studentId, schoolId }` compound unique index).
- `PaymentIntent.memo` is unique — prevents duplicate intents for the same student.
- `FeeStructure.className` is unique per school (`{ schoolId, className }` compound unique index).
- Payments and Students use soft delete (`deletedAt` field) — records are never hard-deleted.
- Payment audit trail is immutable once `status` reaches `SUCCESS` or `FAILED`.

---

## Background Workers

All workers start on server boot inside the `mongoose.connect().then(...)` callback in `app.js` and shut down gracefully on `SIGTERM`/`SIGINT`.

| Worker | Start function | Interval | Purpose |
|---|---|---|---|
| Transaction poller | `startPolling()` | `POLL_INTERVAL_MS` (30s) | Sync new payments from Stellar |
| Retry worker | `startRetryWorker()` | `RETRY_INTERVAL_MS` (60s) | Re-attempt failed verifications |
| Consistency scheduler | `startConsistencyScheduler()` | configurable | Detect DB/chain drift |
| Reminder scheduler | `startReminderScheduler()` | `REMINDER_INTERVAL_MS` (24h) | Send fee reminder emails |
| TX queue worker | `startTxQueueWorker()` | event-driven (BullMQ) | Process queued transactions via Redis |

---

## Multi-School Tenancy

Every document in MongoDB carries a `schoolId` field. The `schoolContext` middleware resolves the school from the `X-School-ID` or `X-School-Slug` request header and attaches it to `req.school`. All queries are scoped to `req.school.schoolId`.

Each school has its own `stellarAddress`. The transaction poller fans out to all active schools in parallel. There is no shared wallet.

---

## Error Handling and Resilience

- All Horizon API calls use `withStellarRetry` — exponential backoff with jitter, retries on transient network errors and HTTP 429/5xx.
- Transient failures during sync are queued as `PendingVerification` documents and retried by `retryService`.
- The `concurrentRequestHandler` middleware adds a circuit breaker (opens after 5 failures, resets after 30s) and a request queue (max 50 concurrent, max 1000 queued) to protect against Horizon API bursts.
- Idempotency keys prevent duplicate payment processing from retried HTTP requests.
- Graceful shutdown waits up to 8s for the retry worker to finish its current batch before closing the MongoDB connection.

---

## Content Security Policy (CSP) Strategy

CSP is enforced at two distinct layers, each appropriate to what it serves.

### Frontend (Next.js)

The browser-facing CSP is configured in `frontend/next.config.js` via the `headers()` function. It applies to every route (`/(.*)`):

| Directive | Value | Reason |
|-----------|-------|--------|
| `default-src` | `'self'` | Baseline: only same-origin resources |
| `script-src` | `'self'` | No inline scripts, no eval |
| `style-src` | `'self'` | No inline styles |
| `img-src` | `'self' data:` | Allows base64 data URIs for QR codes |
| `font-src` | `'self'` | Same-origin fonts only |
| `connect-src` | `'self' https://horizon-testnet.stellar.org https://horizon.stellar.org` | Allows fetch to the backend API and Stellar Horizon |
| `object-src` | `'none'` | Blocks Flash and plugins |
| `frame-ancestors` | `'none'` | Prevents clickjacking |
| `base-uri` | `'self'` | Prevents base tag injection |
| `form-action` | `'self'` | Restricts form submissions |

`'unsafe-inline'` and `'unsafe-eval'` are intentionally absent.

### Backend (Express / Helmet)

The backend serves only JSON API responses — it never renders HTML, loads scripts, or applies styles. HTML-oriented CSP directives (`scriptSrc`, `styleSrc`, `imgSrc`, etc.) are therefore meaningless here and have been removed.

The backend Helmet CSP is intentionally minimal:

```js
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'none'"],   // deny everything by default
    frameAncestors: ["'none'"], // prevent embedding in iframes
  },
}
```

This follows the principle of least privilege: the backend declares that no browser should ever render its responses as a document.
