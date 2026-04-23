# StellarEduPay — API Reference

Base URL: `http://localhost:5000`  
All request bodies use `Content-Type: application/json`.  
All error responses follow the [Error Responses](#error-responses) format.

---

## Table of Contents

- [Authentication](#authentication)
- [School Context](#school-context)
- [Idempotency](#idempotency)
- [Schools](#schools)
- [Students](#students)
- [Fee Structures](#fee-structures)
- [Payments](#payments)
- [Reports](#reports)
- [Disputes](#disputes)
- [Reminders](#reminders)
- [Retry Queue](#retry-queue)
- [Health Check](#health-check)
- [Error Responses](#error-responses)

---

## Authentication

Admin-only endpoints require a JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

Missing or invalid tokens return `401 Unauthorized`.

---

## School Context

Most endpoints are scoped to a school. Provide one of:

```
X-School-ID: SCH-3F2A
X-School-Slug: lincoln-high
```

Missing school context returns:

```json
HTTP 400
{ "error": "School context is required", "code": "MISSING_SCHOOL_CONTEXT" }
```

---

## Idempotency

`POST /api/payments/intent` and `POST /api/payments/verify` require an `Idempotency-Key` header. Use any unique string (e.g. a UUID). The server caches the response for 24 hours.

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Missing the header on these routes returns:

```json
HTTP 400
{ "error": "Idempotency-Key header is required for this request", "code": "MISSING_IDEMPOTENCY_KEY" }
```

---

## Schools

### List all schools
```
GET /api/schools
```
**Response `200`**
```json
[{ "schoolId": "SCH-3F2A", "name": "Lincoln High", "slug": "lincoln-high", "stellarAddress": "G...", "network": "testnet", "isActive": true }]
```

### Get a school
```
GET /api/schools/:schoolId
```
**Response `200`** — school object. **`404`** if not found.

### Create a school — admin only
```
POST /api/schools
Authorization: Bearer <token>
```
**Request body**

| Field | Type | Required |
|---|---|---|
| `name` | string | Yes |
| `slug` | string | Yes |
| `stellarAddress` | string | Yes — valid Stellar public key |
| `network` | string | No — `testnet` (default) or `mainnet` |
| `adminEmail` | string | No |
| `localCurrency` | string | No — ISO 4217 code, default `USD` |

**Response `201`** — created school object.

### Update a school — admin only
```
PATCH /api/schools/:schoolId
Authorization: Bearer <token>
```
**Response `200`** — updated school object.

### Deactivate a school — admin only
```
DELETE /api/schools/:schoolId
Authorization: Bearer <token>
```
**Response `200`**
```json
{ "message": "School deactivated" }
```

---

## Students

All student routes require school context. Write routes require admin auth.

### Register a student — admin only
```
POST /api/students
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `studentId` | string | Yes | 3–20 alphanumeric, hyphens, underscores. **Max 28 characters** — Stellar's text memo field is limited to 28 bytes; IDs longer than 28 characters are rejected with `400 VALIDATION_ERROR`. |
| `name` | string | Yes | |
| `class` | string | Yes | Must match an active fee structure |
| `feeAmount` | number | No | Auto-assigned from fee structure if omitted |
| `parentEmail` | string | No | Used for fee reminders |

**Response `201`**
```json
{
  "studentId": "STU001", "name": "Alice Johnson", "class": "Grade 5A",
  "feeAmount": 250, "feePaid": false, "totalPaid": 0, "remainingBalance": null,
  "createdAt": "2026-03-24T10:00:00.000Z"
}
```
**Errors**
- `400 VALIDATION_ERROR` — invalid fields or no fee structure for the class
- `409 DUPLICATE_STUDENT` — studentId already exists for this school

### Bulk import students — admin only
```
POST /api/students/bulk
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
Content-Type: multipart/form-data
```
Upload a CSV file (field name `file`, max 5 MB) with columns: `studentId`, `name`, `class`.

**Response `200`**
```json
{ "imported": 42, "skipped": 2, "errors": [] }
```

### List all students — admin only
```
GET /api/students
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | Page number |
| `limit` | number | `50` | Results per page (max 200) |
| `feePaid` | boolean | — | Filter by payment status |
| `class` | string | — | Filter by class name |

**Response `200`**
```json
{
  "students": [{ "studentId": "STU001", "name": "Alice Johnson", "class": "Grade 5A", "feeAmount": 250, "feePaid": true }],
  "total": 1, "page": 1, "limit": 50
}
```

### Get a student
```
GET /api/students/:studentId
X-School-ID: SCH-3F2A
```
**Response `200`** — student object. **`404 NOT_FOUND`** if not found.

### Update a student — admin only
```
PUT /api/students/:studentId
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
**Response `200`** — updated student object.

### Delete a student — admin only
```
DELETE /api/students/:studentId
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
Soft-deletes the student (sets `deletedAt`). **Response `200`**
```json
{ "message": "Student deleted" }
```

### Get payment summary
```
GET /api/students/summary
X-School-ID: SCH-3F2A
```
**Response `200`**
```json
{ "total": 100, "paid": 72, "unpaid": 28, "totalCollected": 18000, "totalOutstanding": 7000 }
```

### Get overdue students
```
GET /api/students/overdue
X-School-ID: SCH-3F2A
```
Returns students whose `paymentDeadline` has passed and `feePaid` is false.

**Response `200`** — array of student objects with `isOverdue: true`.

---

## Fee Structures

All fee routes require school context.

### Create / update a fee structure
```
POST /api/fees
X-School-ID: SCH-3F2A
```
If a structure already exists for the class it is updated (upsert).

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `className` | string | Yes | |
| `feeAmount` | number | Yes | Positive number |
| `description` | string | No | |
| `academicYear` | string | No | Defaults to current year |

**Response `201`**
```json
{ "className": "Grade 5A", "feeAmount": 250, "description": "Annual tuition", "academicYear": "2026", "isActive": true }
```
**Errors** — `400 VALIDATION_ERROR` if `className` or `feeAmount` missing/invalid.

### List all fee structures
```
GET /api/fees
X-School-ID: SCH-3F2A
```
**Response `200`** — array of active fee structures sorted by `className`.

### Get fee structure for a class
```
GET /api/fees/:className
X-School-ID: SCH-3F2A
```
`className` must be URL-encoded (e.g. `Grade%205A`).

**Response `200`** — fee structure object. **`404 NOT_FOUND`** if not found.

### Deactivate a fee structure
```
DELETE /api/fees/:className
X-School-ID: SCH-3F2A
```
Sets `isActive: false`. Record is retained for audit.

**Response `200`**
```json
{ "message": "Fee structure for class Grade 5A deactivated" }
```

---

## Payments

### Get payment instructions
```
GET /api/payments/instructions/:studentId
X-School-ID: SCH-3F2A
```
Returns the school wallet address and memo the parent must include when sending a Stellar transaction.

**Response `200`**
```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "memo": "STU001",
  "feeAmount": 250,
  "acceptedAssets": [
    { "code": "XLM",  "type": "native",          "displayName": "Stellar Lumens" },
    { "code": "USDC", "type": "credit_alphanum4", "displayName": "USD Coin" }
  ],
  "paymentLimits": { "min": 0.01, "max": 100000 },
  "note": "Include the payment intent memo exactly when sending payment."
}
```
**Errors** — `404 NOT_FOUND` if student not found.

### Create a payment intent
```
POST /api/payments/intent
X-School-ID: SCH-3F2A
Idempotency-Key: <uuid>
```
Generates a unique time-limited memo (expires in 2 hours) for a student's payment.

**Request body**

| Field | Type | Required |
|---|---|---|
| `studentId` | string | Yes |

**Response `201`**
```json
{
  "studentId": "STU001", "amount": 250,
  "memo": "A3F1C2B4", "status": "pending",
  "expiresAt": "2026-03-24T12:00:00.000Z"
}
```
**Errors** — `404 NOT_FOUND`, `400 AMOUNT_TOO_HIGH` / `AMOUNT_TOO_LOW`.

### Verify a transaction
```
POST /api/payments/verify
X-School-ID: SCH-3F2A
Idempotency-Key: <uuid>
```
Looks up a Stellar transaction by hash, validates it against the school wallet, records the payment, and returns the result. If the Stellar network is temporarily unavailable the transaction is queued for automatic retry.

**Request body**

| Field | Type | Required | Validation |
|---|---|---|---|
| `txHash` | string | Yes | 64-character hex string |

**Response `200`**
```json
{
  "verified": true,
  "hash": "a1b2c3d4...64charhex",
  "memo": "STU001",
  "studentId": "STU001",
  "amount": 250,
  "assetCode": "XLM",
  "feeAmount": 250,
  "feeValidation": { "status": "valid", "excessAmount": 0, "message": "Payment matches the required fee" },
  "networkFee": 0.00001,
  "date": "2026-03-24T10:00:00Z"
}
```

`feeValidation.status` values:

| Status | Meaning | `feePaid` updated? |
|---|---|---|
| `valid` | Exact match | Yes |
| `overpaid` | Exceeds required fee | Yes |
| `underpaid` | Below required fee | No |
| `unknown` | Student not found | No |

**Response `202`** — Stellar network temporarily unavailable, queued for retry:
```json
{ "message": "Transaction queued for retry.", "txHash": "a1b2c3d4...", "status": "queued_for_retry" }
```

**Errors**

| Code | Status | Description |
|---|---|---|
| `TX_FAILED` | 400 | Transaction failed on-chain |
| `MISSING_MEMO` | 400 | No memo on the transaction |
| `INVALID_DESTINATION` | 400 | Payment not sent to school wallet |
| `UNSUPPORTED_ASSET` | 400 | Asset not accepted |
| `AMOUNT_TOO_LOW` | 400 | Below minimum limit |
| `AMOUNT_TOO_HIGH` | 400 | Above maximum limit |
| `DUPLICATE_TX` | 409 | Already recorded |
| `STELLAR_NETWORK_ERROR` | 502 | Horizon API unreachable |

### Verify by hash (no school context)
```
GET /api/payments/verify/:txHash
```
Read-only lookup of a transaction by hash. Does not record the payment.

**Response `200`** — same shape as `POST /api/payments/verify`.

### Submit a signed transaction
```
POST /api/payments/submit
X-School-ID: SCH-3F2A
```
Submits a pre-signed XDR transaction envelope to the Stellar network.

**Request body**

| Field | Type | Required |
|---|---|---|
| `xdr` | string | Yes — base64-encoded XDR |

**Response `200`**
```json
{ "verified": true, "hash": "abc...", "ledger": 1234, "status": "SUCCESS" }
```

### Sync payments from blockchain — admin only
```
POST /api/payments/sync
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
Fetches recent transactions from Stellar Horizon, matches memos to students, and records new payments. Safe to call repeatedly — duplicates are skipped.

**Response `200`**
```json
{ "message": "Sync complete" }
```
**Errors** — `502 STELLAR_NETWORK_ERROR` if Horizon is unreachable.

### Get sync status
```
GET /api/payments/sync/status
X-School-ID: SCH-3F2A
```
**Response `200`**
```json
{ "lastSyncAt": "2026-03-24T10:00:00.000Z", "status": "idle" }
```

### Finalize pending payments — admin only
```
POST /api/payments/finalize
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
Promotes `pending_confirmation` payments to `confirmed` once the ledger threshold is met.

**Response `200`**
```json
{ "message": "Finalization complete" }
```

### Get all payments
```
GET /api/payments
X-School-ID: SCH-3F2A
```
**Response `200`** — array of payment objects for the school.

### Get payment history for a student
```
GET /api/payments/:studentId
X-School-ID: SCH-3F2A
```
**Response `200`** — array of payment objects sorted by `confirmedAt` descending.
```json
[{
  "studentId": "STU001", "txHash": "a1b2c3d4...",
  "amount": 250, "feeAmount": 250, "feeValidationStatus": "valid",
  "status": "confirmed", "confirmationStatus": "confirmed",
  "memo": "STU001", "senderAddress": "GPARENT...",
  "isSuspicious": false, "confirmedAt": "2026-03-24T10:00:00.000Z"
}]
```

### Get student balance
```
GET /api/payments/balance/:studentId
X-School-ID: SCH-3F2A
```
**Response `200`**
```json
{ "studentId": "STU001", "feeAmount": 250, "totalPaid": 250, "remainingBalance": 0, "excessAmount": 0, "feePaid": true, "installmentCount": 1 }
```

### Get accepted assets
```
GET /api/payments/accepted-assets
X-School-ID: SCH-3F2A
```
**Response `200`**
```json
{ "assets": [{ "code": "XLM", "type": "native", "displayName": "Stellar Lumens" }] }
```

### Get payment limits
```
GET /api/payments/limits
X-School-ID: SCH-3F2A
```
**Response `200`**
```json
{ "min": 0.01, "max": 100000, "message": "Payment amounts must be between 0.01 and 100000" }
```

### Get exchange rates
```
GET /api/payments/rates
X-School-ID: SCH-3F2A
```
**Response `200`** — current XLM/USDC exchange rates for the school's local currency.

### Get overpayments
```
GET /api/payments/overpayments
X-School-ID: SCH-3F2A
```
**Response `200`**
```json
{ "count": 2, "totalExcess": 15.5, "overpayments": [{ "studentId": "STU002", "txHash": "b2c3...", "amount": 260, "feeAmount": 250, "excessAmount": 10 }] }
```

### Get suspicious payments
```
GET /api/payments/suspicious
X-School-ID: SCH-3F2A
```
Returns payments flagged for memo collision or abnormal amount patterns.

**Response `200`**
```json
{ "count": 1, "suspicious": [{ "studentId": "STU003", "txHash": "c3d4...", "isSuspicious": true, "suspicionReason": "Memo used by different sender within 24h" }] }
```

### Get pending payments
```
GET /api/payments/pending
X-School-ID: SCH-3F2A
```
Returns payments with `confirmationStatus: "pending_confirmation"`.

**Response `200`**
```json
{ "count": 1, "pending": [{ "studentId": "STU001", "txHash": "d4e5...", "amount": 250, "confirmationStatus": "pending_confirmation" }] }
```

### Get retry queue
```
GET /api/payments/retry-queue
X-School-ID: SCH-3F2A
```
Shows transactions awaiting re-verification after transient Stellar network errors.

**Response `200`**
```json
{
  "pending":   { "count": 1, "items": [{ "txHash": "e5f6...", "attempts": 2, "nextRetryAt": "2026-03-24T10:05:00.000Z", "lastError": "timeout" }] },
  "dead_letter": { "count": 0, "items": [] },
  "recently_resolved": { "count": 1, "items": [{ "txHash": "f6a7...", "resolvedAt": "2026-03-24T09:50:00.000Z" }] }
}
```

### Get dead-letter jobs
```
GET /api/payments/dlq
X-School-ID: SCH-3F2A
```
Returns transactions that exhausted all retry attempts.

### Retry a dead-letter job
```
POST /api/payments/dlq/:id/retry
X-School-ID: SCH-3F2A
```
**Response `200`**
```json
{ "message": "Job re-queued" }
```

### Generate receipt
```
GET /api/payments/receipt/:txHash
X-School-ID: SCH-3F2A
```
**Response `200`** — payment receipt object.

### Get queue job status
```
GET /api/payments/queue/:txHash
X-School-ID: SCH-3F2A
```
**Response `200`** — BullMQ job status for the given transaction.

### Stream payment events (SSE)
```
GET /api/payments/events
X-School-ID: SCH-3F2A
```
Server-Sent Events stream. Emits a `payment` event each time a new payment is confirmed for the school.

```
Content-Type: text/event-stream

data: {"studentId":"STU001","txHash":"a1b2...","amount":250,"confirmedAt":"2026-03-24T10:00:00.000Z"}
```

### Lock / unlock a payment — admin only
```
POST /api/payments/:paymentId/lock
POST /api/payments/:paymentId/unlock
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
Optimistic locking for concurrent update protection.

---

## Reports

All report routes require school context.

### Get payment report
```
GET /api/reports
X-School-ID: SCH-3F2A
```
**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `startDate` | string | ISO date, inclusive (e.g. `2026-01-01`) |
| `endDate` | string | ISO date, inclusive (e.g. `2026-12-31`) |
| `format` | string | `json` (default) or `csv` |

**Response `200` (JSON)**
```json
{
  "generatedAt": "2026-03-24T10:00:00.000Z",
  "period": { "startDate": "2026-01-01", "endDate": "2026-03-31" },
  "summary": { "totalAmount": 1250, "paymentCount": 5, "validCount": 4, "overpaidCount": 1, "underpaidCount": 0, "fullyPaidStudentCount": 4 },
  "byDate": [{ "date": "2026-03-24", "totalAmount": 500, "paymentCount": 2, "uniqueStudentCount": 2 }]
}
```

**Response `200` (CSV)** — `Content-Disposition: attachment; filename="report.csv"`

**Errors** — `400 VALIDATION_ERROR` if `startDate` is after `endDate`.

### Get dashboard summary
```
GET /api/reports/dashboard
X-School-ID: SCH-3F2A
```
**Response `200`** — aggregated stats for the school dashboard (total students, total collected, unpaid count, recent payments).

---

## Disputes

All dispute routes require school context.

### Flag a dispute
```
POST /api/disputes
X-School-ID: SCH-3F2A
```
**Request body**

| Field | Type | Required |
|---|---|---|
| `txHash` | string | Yes |
| `studentId` | string | Yes |
| `raisedBy` | string | Yes |
| `reason` | string | Yes |

**Response `201`**
```json
{ "_id": "...", "txHash": "a1b2...", "studentId": "STU001", "raisedBy": "Parent Name", "reason": "Amount incorrect", "status": "open", "createdAt": "2026-03-24T10:00:00.000Z" }
```

### List disputes
```
GET /api/disputes
X-School-ID: SCH-3F2A
```
**Query parameters** — `status` (`open`, `under_review`, `resolved`, `rejected`), `studentId`.

**Response `200`** — array of dispute objects.

### Get a dispute
```
GET /api/disputes/:id
X-School-ID: SCH-3F2A
```
**Response `200`** — dispute object. **`404 NOT_FOUND`** if not found.

### Resolve a dispute — admin only
```
PATCH /api/disputes/:id/resolve
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
**Request body**

| Field | Type | Required |
|---|---|---|
| `status` | string | Yes — `resolved` or `rejected` |
| `resolutionNote` | string | No |

**Response `200`** — updated dispute object.

---

## Reminders

All reminder routes require admin auth and school context.

### Trigger fee reminders — admin only
```
POST /api/reminders/trigger
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
Sends reminder emails to all eligible students with unpaid fees (respects cooldown and max count per student).

**Response `200`**
```json
{ "sent": 12, "skipped": 3 }
```

### Preview reminders — admin only
```
GET /api/reminders/preview
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
Returns the list of students who would receive a reminder if triggered now, without sending anything.

**Response `200`** — array of student objects.

### Set reminder opt-out — admin only
```
POST /api/reminders/opt-out
Authorization: Bearer <token>
X-School-ID: SCH-3F2A
```
**Request body**

| Field | Type | Required |
|---|---|---|
| `studentId` | string | Yes |
| `optOut` | boolean | Yes |

**Response `200`**
```json
{ "studentId": "STU001", "reminderOptOut": true }
```

---

## Retry Queue

All retry queue routes require admin auth.

### Get queue stats — admin only
```
GET /api/retry-queue/stats
Authorization: Bearer <token>
```
**Response `200`** — BullMQ queue statistics (waiting, active, completed, failed counts).

### Get queue health — admin only
```
GET /api/retry-queue/health
Authorization: Bearer <token>
```
**Response `200`** — queue health status and Redis connection info.

### Get a job — admin only
```
GET /api/retry-queue/jobs/:jobId
Authorization: Bearer <token>
```
**Response `200`** — job details including state, attempts, and last error.

### List jobs by state — admin only
```
GET /api/retry-queue/jobs/state/:state
Authorization: Bearer <token>
```
`state` values: `waiting`, `active`, `completed`, `failed`, `delayed`.

**Response `200`** — array of job objects.

### Manually retry a job — admin only
```
POST /api/retry-queue/jobs/:jobId/retry
Authorization: Bearer <token>
```
**Response `200`**
```json
{ "message": "Job re-queued" }
```

### Delete a job — admin only
```
DELETE /api/retry-queue/jobs/:jobId
Authorization: Bearer <token>
```
**Response `200`**
```json
{ "message": "Job deleted" }
```

### Pause queue — admin only
```
POST /api/retry-queue/pause
Authorization: Bearer <token>
```

### Resume queue — admin only
```
POST /api/retry-queue/resume
Authorization: Bearer <token>
```

### Manually queue a transaction — admin only
```
POST /api/retry-queue/queue
Authorization: Bearer <token>
```
**Request body**

| Field | Type | Required |
|---|---|---|
| `txHash` | string | Yes |
| `schoolId` | string | Yes |
| `studentId` | string | No |

**Response `201`**
```json
{ "jobId": "42", "txHash": "a1b2..." }
```

---

## Health Check

```
GET /health
```
Simple liveness probe. No auth or school context required.

**Response `200`**
```json
{
  "status": "healthy",
  "timestamp": "2026-04-23T15:00:00.000Z",
  "checks": {
    "database": { "status": "healthy", "latency_ms": 2 },
    "stellar": { "status": "healthy", "latency_ms": 120, "network": "testnet", "horizonUrl": "https://horizon-testnet.stellar.org" },
    "paymentProcessor": { "queueDepth": 0, "maxQueueDepth": 1000 }
  }
}
```

`checks.paymentProcessor.queueDepth` is the number of payments currently being processed. When it reaches `maxQueueDepth` (controlled by `MAX_QUEUE_DEPTH` env var), new payments return `QUEUE_FULL` and are retried automatically.

---

## Error Responses

All errors return:

```json
{ "error": "Human-readable description", "code": "ERROR_CODE" }
```

Validation middleware failures return an `errors` array:

```json
{ "errors": ["studentId must be 3–20 alphanumeric characters", "name is required"] }
```

### Error Code Reference

| Code | HTTP | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body or query parameter failed validation |
| `INVALID_DATE_FORMAT` | 400 | `startDate` or `endDate` is not a valid ISO 8601 date, or `startDate` is after `endDate` |
| `MISSING_IDEMPOTENCY_KEY` | 400 | `Idempotency-Key` header missing on required routes |
| `MISSING_SCHOOL_CONTEXT` | 400 | `X-School-ID` or `X-School-Slug` header missing |
| `TX_FAILED` | 400 | Stellar transaction failed on-chain |
| `MISSING_MEMO` | 400 | Transaction has no memo field |
| `INVALID_DESTINATION` | 400 | Payment not sent to school wallet |
| `UNSUPPORTED_ASSET` | 400 | Asset not in accepted list |
| `AMOUNT_TOO_LOW` | 400 | Payment below `MIN_PAYMENT_AMOUNT` |
| `AMOUNT_TOO_HIGH` | 400 | Payment exceeds `MAX_PAYMENT_AMOUNT` |
| `UNDERPAID` | 400 | Payment amount less than required fee |
| `NOT_FOUND` | 404 | Resource does not exist |
| `SCHOOL_NOT_FOUND` | 404 | School not found or inactive |
| `DUPLICATE_TX` | 409 | Transaction hash already recorded |
| `DUPLICATE_SCHOOL` | 409 | School slug or ID already exists |
| `DUPLICATE_STUDENT` | 409 | Student ID already exists for this school |
| `STELLAR_NETWORK_ERROR` | 502 | Stellar Horizon API unreachable |
| `REQUEST_TIMEOUT` | 503 | Request exceeded server timeout |
| `QUEUE_FULL` | 503 | Payment processor queue is at capacity; caller should retry after a delay |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Transaction Queue Durability

The transaction processing queue (`transactionQueue.js`) provides **durable job delivery** via a two-layer approach:

### How it works

1. **MongoDB persistence first** — before a job is handed to Redis/BullMQ, a `PendingVerification` document is upserted with `status: pending`. This write is the source of truth.

2. **Redis/BullMQ best-effort** — the job is then added to BullMQ. If Redis is unavailable the job is still safe in MongoDB and will be recovered on the next startup.

3. **Startup recovery** — on every server start, `recoverPendingJobs()` queries MongoDB for all documents with `status: pending | processing` and re-enqueues them into BullMQ. Documents with `status: processing` are reset to `pending` first (they were in-flight when the server crashed).

4. **Outcome tracking** — when a job completes successfully the document is updated to `status: resolved`. When a job permanently fails (e.g. `TX_FAILED`, `UNSUPPORTED_ASSET`) the document is updated to `status: dead_letter` with the error message stored in `lastError`.

### Idempotency

`txHash` is the unique key for `PendingVerification` (MongoDB unique index). Calling `enqueueTransaction()` twice for the same hash is safe — the upsert uses `$setOnInsert` so the existing document is not overwritten, and BullMQ deduplicates by `jobId: txHash`.

### PendingVerification document statuses

| Status | Meaning |
|---|---|
| `pending` | Job persisted to MongoDB, not yet processed |
| `processing` | Worker picked up the job; in-flight |
| `resolved` | Job completed successfully |
| `dead_letter` | Permanent failure; will not be retried |

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TX_QUEUE_CONCURRENCY` | `5` | Number of concurrent transaction processing workers |
| `REDIS_HOST` | `localhost` | Redis host for BullMQ |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | _(none)_ | Redis password (optional) |


---

## Source Validation Rules

Source validation rules allow administrators to control which Stellar payment source addresses are accepted or flagged. Rules are global (not per-school) and are evaluated during payment processing.

### Rule Types

| Type | Description |
|------|-------------|
| `blacklist` | Reject payments from a specific source address |
| `whitelist` | Only accept payments from a specific source address |
| `pattern` | Match source addresses against a regular expression |
| `new_sender_limit` | Cap the number of transactions per day from first-time senders |

### Endpoints

All source-rule endpoints require admin authentication (`Authorization: Bearer <token>`).

---

#### POST /api/source-rules

Create a new source validation rule.

**Request body:**

```json
{
  "name": "block-suspicious-sender",
  "type": "blacklist",
  "value": "GBADACTOR...",
  "description": "Known fraudulent address",
  "isActive": true,
  "priority": 10
}
```

For `new_sender_limit` rules, include `maxTransactionsPerDay` instead of `value`:

```json
{
  "name": "new-sender-cap",
  "type": "new_sender_limit",
  "maxTransactionsPerDay": 3,
  "description": "Limit new senders to 3 transactions per day"
}
```

**Required fields:** `name`, `type`  
**Required for blacklist/whitelist/pattern:** `value`

**Response `201`:**

```json
{
  "_id": "...",
  "name": "block-suspicious-sender",
  "type": "blacklist",
  "value": "GBADACTOR...",
  "description": "Known fraudulent address",
  "isActive": true,
  "priority": 10,
  "maxTransactionsPerDay": null,
  "createdAt": "2026-04-23T00:00:00.000Z",
  "updatedAt": "2026-04-23T00:00:00.000Z"
}
```

**Error responses:**

| Status | Code | Reason |
|--------|------|--------|
| 400 | `VALIDATION_ERROR` | Missing required fields, invalid type, or invalid regex pattern |
| 401 | `MISSING_AUTH_TOKEN` | No Bearer token provided |
| 403 | `INSUFFICIENT_ROLE` | Token does not have admin role |
| 409 | `DUPLICATE_RULE` | A rule with this name already exists |

---

#### GET /api/source-rules

List all source validation rules. Supports optional query filters.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by rule type (`blacklist`, `whitelist`, `pattern`, `new_sender_limit`) |
| `isActive` | boolean | Filter by active status (`true` or `false`) |

**Response `200`:**

```json
[
  {
    "_id": "...",
    "name": "block-suspicious-sender",
    "type": "blacklist",
    "value": "GBADACTOR...",
    "isActive": true,
    "priority": 10,
    "createdAt": "2026-04-23T00:00:00.000Z"
  }
]
```

---

#### DELETE /api/source-rules/:id

Permanently delete a source validation rule by its MongoDB `_id`.

**Response `200`:**

```json
{
  "message": "Rule \"block-suspicious-sender\" deleted."
}
```

**Error responses:**

| Status | Code | Reason |
|--------|------|--------|
| 401 | `MISSING_AUTH_TOKEN` | No Bearer token provided |
| 403 | `INSUFFICIENT_ROLE` | Token does not have admin role |
| 404 | `NOT_FOUND` | No rule found with the given id |

