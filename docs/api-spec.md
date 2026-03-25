# StellarEduPay — API Reference

Base URL: `http://localhost:5000/api`

All request bodies must use `Content-Type: application/json`.  
All error responses follow a consistent envelope (see [Error Responses](#error-responses)).

---

## Table of Contents

- [Students](#students)
- [Fee Structures](#fee-structures)
- [Payments](#payments)
- [Reports](#reports)
- [Health Check](#health-check)
- [Error Responses](#error-responses)

---

## Students

### Register a Student

```
POST /api/students
```

Creates a new student record. If `feeAmount` is omitted, the fee is automatically
assigned from the active fee structure for the given class.

**Request body**

| Field       | Type   | Required | Validation                                      |
|-------------|--------|----------|-------------------------------------------------|
| `studentId` | string | Yes      | 3–20 alphanumeric characters, hyphens, underscores |
| `name`      | string | Yes      | Non-empty string                                |
| `class`     | string | Yes      | Non-empty string                                |
| `feeAmount` | number | No       | Positive number; auto-assigned from fee structure if omitted |

**Example request**

```bash
curl -X POST http://localhost:5000/api/students \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "STU001",
    "name": "Alice Johnson",
    "class": "Grade 5A"
  }'
```

**Response `201 Created`**

```json
{
  "studentId": "STU001",
  "name": "Alice Johnson",
  "class": "Grade 5A",
  "feeAmount": 250,
  "feePaid": false,
  "totalPaid": 0,
  "remainingBalance": null,
  "createdAt": "2026-03-24T10:00:00.000Z",
  "updatedAt": "2026-03-24T10:00:00.000Z"
}
```

**Validation errors `400`**

```json
{
  "errors": [
    "studentId must be 3–20 alphanumeric characters",
    "name is required"
  ]
}
```

**No fee structure found `400`**

```json
{
  "error": "No fee amount provided and no fee structure found for class \"Grade 5A\". Please create a fee structure first or provide feeAmount.",
  "code": "VALIDATION_ERROR"
}
```

---

### List All Students

```
GET /api/students
```

Returns all registered students, sorted by most recently created.

**Example request**

```bash
curl http://localhost:5000/api/students
```

**Response `200 OK`**

```json
[
  {
    "studentId": "STU001",
    "name": "Alice Johnson",
    "class": "Grade 5A",
    "feeAmount": 250,
    "feePaid": true,
    "totalPaid": 250,
    "remainingBalance": null,
    "createdAt": "2026-03-24T10:00:00.000Z",
    "updatedAt": "2026-03-24T10:00:00.000Z"
  }
]
```

---

### Get a Student

```
GET /api/students/:studentId
```

**Path parameter**

| Parameter   | Validation                                         |
|-------------|----------------------------------------------------|
| `studentId` | 3–20 alphanumeric characters, hyphens, underscores |

**Example request**

```bash
curl http://localhost:5000/api/students/STU001
```

**Response `200 OK`**

```json
{
  "studentId": "STU001",
  "name": "Alice Johnson",
  "class": "Grade 5A",
  "feeAmount": 250,
  "feePaid": true,
  "totalPaid": 250,
  "remainingBalance": null,
  "createdAt": "2026-03-24T10:00:00.000Z",
  "updatedAt": "2026-03-24T10:00:00.000Z"
}
```

**Not found `404`**

```json
{ "error": "Student not found", "code": "NOT_FOUND" }
```

---

## Fee Structures

### Create / Update a Fee Structure

```
POST /api/fees
```

Creates a fee structure for a class. If a structure already exists for the class,
it is updated (upsert). The new fee applies to students registered after this point;
existing students retain their assigned `feeAmount`.

**Request body**

| Field          | Type   | Required | Validation           |
|----------------|--------|----------|----------------------|
| `className`    | string | Yes      | Non-empty string     |
| `feeAmount`    | number | Yes      | Positive number      |
| `description`  | string | No       | Free text            |
| `academicYear` | string | No       | Defaults to current year |

**Example request**

```bash
curl -X POST http://localhost:5000/api/fees \
  -H "Content-Type: application/json" \
  -d '{
    "className": "Grade 5A",
    "feeAmount": 250,
    "description": "Annual tuition fees",
    "academicYear": "2026"
  }'
```

**Response `201 Created`**

```json
{
  "_id": "...",
  "className": "Grade 5A",
  "feeAmount": 250,
  "description": "Annual tuition fees",
  "academicYear": "2026",
  "isActive": true,
  "createdAt": "2026-03-24T10:00:00.000Z",
  "updatedAt": "2026-03-24T10:00:00.000Z"
}
```

**Validation errors `400`**

```json
{
  "errors": [
    "className is required",
    "feeAmount must be a positive number"
  ]
}
```

---

### List All Fee Structures

```
GET /api/fees
```

Returns all active fee structures sorted alphabetically by class name.

**Example request**

```bash
curl http://localhost:5000/api/fees
```

**Response `200 OK`**

```json
[
  {
    "_id": "...",
    "className": "Grade 5A",
    "feeAmount": 250,
    "description": "Annual tuition fees",
    "academicYear": "2026",
    "isActive": true,
    "createdAt": "2026-03-24T10:00:00.000Z",
    "updatedAt": "2026-03-24T10:00:00.000Z"
  }
]
```

---

### Get Fee Structure for a Class

```
GET /api/fees/:className
```

**Path parameter**

| Parameter   | Description                        |
|-------------|------------------------------------|
| `className` | URL-encoded class name (e.g. `Grade%205A`) |

**Example request**

```bash
curl http://localhost:5000/api/fees/Grade%205A
```

**Response `200 OK`**

```json
{
  "_id": "...",
  "className": "Grade 5A",
  "feeAmount": 250,
  "description": "Annual tuition fees",
  "academicYear": "2026",
  "isActive": true,
  "createdAt": "2026-03-24T10:00:00.000Z",
  "updatedAt": "2026-03-24T10:00:00.000Z"
}
```

**Not found `404`**

```json
{ "error": "No fee structure found for class Grade 5A", "code": "NOT_FOUND" }
```

---

### Deactivate a Fee Structure

```
DELETE /api/fees/:className
```

Soft-deletes the fee structure by setting `isActive: false`. The record is retained
for audit purposes.

**Example request**

```bash
curl -X DELETE http://localhost:5000/api/fees/Grade%205A
```

**Response `200 OK`**

```json
{ "message": "Fee structure for class Grade 5A deactivated" }
```

**Not found `404`**

```json
{ "error": "Fee structure not found", "code": "NOT_FOUND" }
```

---

## Payments

### Get Payment Instructions

```
GET /api/payments/instructions/:studentId
```

Returns the school wallet address, the memo the parent must include, accepted
assets, and current payment limits. Share this with the parent before they send
a Stellar transaction.

**Path parameter**

| Parameter   | Validation                                         |
|-------------|----------------------------------------------------|
| `studentId` | 3–20 alphanumeric characters, hyphens, underscores |

**Example request**

```bash
curl http://localhost:5000/api/payments/instructions/STU001
```

**Response `200 OK`**

```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "memo": "STU001",
  "acceptedAssets": [
    { "code": "XLM",  "type": "native",          "displayName": "Stellar Lumens" },
    { "code": "USDC", "type": "credit_alphanum4", "displayName": "USD Coin" }
  ],
  "paymentLimits": {
    "min": 0.01,
    "max": 100000
  },
  "note": "Include the payment intent memo exactly when sending payment to ensure your fees are credited."
}
```

---

### Create a Payment Intent

```
POST /api/payments/intent
```

Generates a unique, time-limited memo for a student's payment. The intent expires
after 2 hours. Use the returned `memo` instead of the raw `studentId` when a
one-time reference is preferred.

**Request body**

| Field       | Type   | Required |
|-------------|--------|----------|
| `studentId` | string | Yes      |

**Example request**

```bash
curl -X POST http://localhost:5000/api/payments/intent \
  -H "Content-Type: application/json" \
  -d '{ "studentId": "STU001" }'
```

**Response `201 Created`**

```json
{
  "_id": "...",
  "studentId": "STU001",
  "amount": 250,
  "memo": "A3F1C2B4",
  "status": "pending",
  "expiresAt": "2026-03-24T12:00:00.000Z",
  "createdAt": "2026-03-24T10:00:00.000Z",
  "updatedAt": "2026-03-24T10:00:00.000Z"
}
```

**Student not found `404`**

```json
{ "error": "Student not found", "code": "NOT_FOUND" }
```

**Fee outside payment limits `400`**

```json
{ "error": "Payment amount exceeds maximum limit", "code": "AMOUNT_TOO_HIGH" }
```

---

### Verify a Transaction

```
POST /api/payments/verify
```

Looks up a Stellar transaction by hash, validates it against the school wallet and
accepted assets, records the payment, and returns the verification result.

If the Stellar network is temporarily unavailable, the transaction is queued for
automatic retry and a `202 Accepted` response is returned.

**Request body**

| Field    | Type   | Required | Validation                    |
|----------|--------|----------|-------------------------------|
| `txHash` | string | Yes      | 64-character lowercase hex string |

**Example request**

```bash
curl -X POST http://localhost:5000/api/payments/verify \
  -H "Content-Type: application/json" \
  -d '{ "txHash": "a1b2c3d4e5f6...64charhex...a1b2c3d4e5f6" }'
```

**Response `200 OK`**

```json
{
  "verified": true,
  "hash": "a1b2c3d4e5f6...64charhex...a1b2c3d4e5f6",
  "memo": "STU001",
  "studentId": "STU001",
  "amount": 250,
  "assetCode": "XLM",
  "assetType": "native",
  "feeAmount": 250,
  "feeValidation": {
    "status": "valid",
    "excessAmount": 0,
    "message": "Payment matches the required fee"
  },
  "date": "2026-03-24T10:00:00Z"
}
```

`feeValidation.status` values:

| Status      | Meaning                                      | `feePaid` updated? |
|-------------|----------------------------------------------|--------------------|
| `valid`     | Amount exactly matches the required fee      | Yes                |
| `overpaid`  | Amount exceeds the required fee              | Yes                |
| `underpaid` | Amount is less than required                 | No                 |
| `unknown`   | Student not found or memo missing            | No                 |

**Queued for retry `202 Accepted`** (transient Stellar network error)

```json
{
  "message": "Stellar network is temporarily unavailable. Your transaction has been queued and will be verified automatically once the network recovers.",
  "txHash": "a1b2c3d4...",
  "status": "queued_for_retry"
}
```

**Validation error `400`**

```json
{ "error": "txHash must be a 64-character hex string" }
```

**Already recorded `409`**

```json
{ "error": "Transaction a1b2c3d4... has already been processed", "code": "DUPLICATE_TX" }
```

---

### Sync Payments from Blockchain

```
POST /api/payments/sync
```

Fetches the 20 most recent transactions to the school wallet from the Stellar
Horizon API, matches memos to registered students, validates amounts, and records
any new payments. Safe to call repeatedly — duplicate transactions are skipped.

**Example request**

```bash
curl -X POST http://localhost:5000/api/payments/sync
```

**Response `200 OK`**

```json
{ "message": "Sync complete" }
```

**Stellar network unavailable `502`**

```json
{ "error": "Stellar network error: ...", "code": "STELLAR_NETWORK_ERROR" }
```

---

### Finalize Payments

```
POST /api/payments/finalize
```

Promotes payments with `confirmationStatus: "pending_confirmation"` to `"confirmed"`
after verifying their ledger status. Called automatically by the background polling
service; can also be triggered manually.

**Example request**

```bash
curl -X POST http://localhost:5000/api/payments/finalize
```

**Response `200 OK`**

```json
{ "message": "Finalization complete" }
```

---

### Get Payment History for a Student

```
GET /api/payments/:studentId
```

Returns all recorded payments for a student, sorted by most recently confirmed.

**Path parameter**

| Parameter   | Validation                                         |
|-------------|----------------------------------------------------|
| `studentId` | 3–20 alphanumeric characters, hyphens, underscores |

**Example request**

```bash
curl http://localhost:5000/api/payments/STU001
```

**Response `200 OK`**

```json
[
  {
    "_id": "...",
    "studentId": "STU001",
    "txHash": "a1b2c3d4...",
    "amount": 250,
    "feeAmount": 250,
    "feeValidationStatus": "valid",
    "excessAmount": 0,
    "status": "confirmed",
    "memo": "STU001",
    "senderAddress": "GPARENT...",
    "isSuspicious": false,
    "suspicionReason": null,
    "ledger": 12345678,
    "confirmationStatus": "confirmed",
    "transactionHash": "a1b2c3d4...",
    "confirmedAt": "2026-03-24T10:00:00.000Z",
    "verifiedAt": "2026-03-24T10:01:00.000Z",
    "createdAt": "2026-03-24T10:01:00.000Z",
    "updatedAt": "2026-03-24T10:01:00.000Z"
  }
]
```

---

### Get Student Balance

```
GET /api/payments/balance/:studentId
```

Returns a real-time balance summary for a student, aggregated across all confirmed
payments.

**Example request**

```bash
curl http://localhost:5000/api/payments/balance/STU001
```

**Response `200 OK`**

```json
{
  "studentId": "STU001",
  "feeAmount": 250,
  "totalPaid": 250,
  "remainingBalance": 0,
  "excessAmount": 0,
  "feePaid": true,
  "installmentCount": 1
}
```

**Not found `404`**

```json
{ "error": "Student not found", "code": "NOT_FOUND" }
```

---

### List Accepted Assets

```
GET /api/payments/accepted-assets
```

Returns the list of Stellar assets the school wallet accepts.

**Example request**

```bash
curl http://localhost:5000/api/payments/accepted-assets
```

**Response `200 OK`**

```json
{
  "assets": [
    { "code": "XLM",  "type": "native",          "displayName": "Stellar Lumens" },
    { "code": "USDC", "type": "credit_alphanum4", "displayName": "USD Coin" }
  ]
}
```

---

### Get Payment Limits

```
GET /api/payments/limits
```

Returns the configured minimum and maximum payment amounts.

**Example request**

```bash
curl http://localhost:5000/api/payments/limits
```

**Response `200 OK`**

```json
{
  "min": 0.01,
  "max": 100000,
  "message": "Payment amounts must be between 0.01 and 100000"
}
```

---

### Get Overpayments

```
GET /api/payments/overpayments
```

Returns all payments where the amount exceeded the required fee, along with the
total excess collected.

**Example request**

```bash
curl http://localhost:5000/api/payments/overpayments
```

**Response `200 OK`**

```json
{
  "count": 2,
  "totalExcess": 15.5,
  "overpayments": [
    {
      "studentId": "STU002",
      "txHash": "b2c3d4...",
      "amount": 260,
      "feeAmount": 250,
      "feeValidationStatus": "overpaid",
      "excessAmount": 10,
      "confirmedAt": "2026-03-24T10:00:00.000Z"
    }
  ]
}
```

---

### Get Suspicious Payments

```
GET /api/payments/suspicious
```

Returns payments flagged as suspicious (e.g. duplicate sender, unusual amount
patterns). Intended for admin review.

**Example request**

```bash
curl http://localhost:5000/api/payments/suspicious
```

**Response `200 OK`**

```json
{
  "count": 1,
  "suspicious": [
    {
      "studentId": "STU003",
      "txHash": "c3d4e5...",
      "amount": 0.001,
      "isSuspicious": true,
      "suspicionReason": "Amount below expected threshold",
      "confirmedAt": "2026-03-24T10:00:00.000Z"
    }
  ]
}
```

---

### Get Pending Payments

```
GET /api/payments/pending
```

Returns payments with `confirmationStatus: "pending_confirmation"` — transactions
seen on the network but not yet finalized.

**Example request**

```bash
curl http://localhost:5000/api/payments/pending
```

**Response `200 OK`**

```json
{
  "count": 1,
  "pending": [
    {
      "studentId": "STU001",
      "txHash": "d4e5f6...",
      "amount": 250,
      "confirmationStatus": "pending_confirmation",
      "createdAt": "2026-03-24T10:00:00.000Z"
    }
  ]
}
```

---

### Get Retry Queue

```
GET /api/payments/retry-queue
```

Observability endpoint for the automatic retry worker. Shows transactions that
failed due to transient Stellar network errors and are awaiting re-verification.

**Example request**

```bash
curl http://localhost:5000/api/payments/retry-queue
```

**Response `200 OK`**

```json
{
  "pending": {
    "count": 1,
    "items": [
      {
        "txHash": "e5f6a7...",
        "studentId": "STU001",
        "status": "pending",
        "attempts": 2,
        "nextRetryAt": "2026-03-24T10:05:00.000Z",
        "lastError": "Stellar network timeout"
      }
    ]
  },
  "dead_letter": {
    "count": 0,
    "items": []
  },
  "recently_resolved": {
    "count": 1,
    "items": [
      {
        "txHash": "f6a7b8...",
        "status": "resolved",
        "resolvedAt": "2026-03-24T09:50:00.000Z"
      }
    ]
  }
}
```

---

## Reports

### Generate Payment Report

```
GET /api/reports
```

Returns a payment summary report aggregated by date. Optionally filter by date
range. Supports JSON (default) and CSV output.

**Query parameters**

| Parameter   | Type   | Required | Description                                      |
|-------------|--------|----------|--------------------------------------------------|
| `startDate` | string | No       | ISO date string, e.g. `2026-01-01`. Inclusive.   |
| `endDate`   | string | No       | ISO date string, e.g. `2026-12-31`. Inclusive (full day). |
| `format`    | string | No       | `json` (default) or `csv`                        |

**Example requests**

```bash
# JSON report for a date range
curl "http://localhost:5000/api/reports?startDate=2026-01-01&endDate=2026-03-31"

# CSV download
curl "http://localhost:5000/api/reports?format=csv" -o report.csv

# All-time report
curl http://localhost:5000/api/reports
```

**Response `200 OK` (JSON)**

```json
{
  "generatedAt": "2026-03-24T10:00:00.000Z",
  "period": {
    "startDate": "2026-01-01",
    "endDate": "2026-03-31"
  },
  "summary": {
    "totalAmount": 1250,
    "paymentCount": 5,
    "validCount": 4,
    "overpaidCount": 1,
    "underpaidCount": 0,
    "fullyPaidStudentCount": 4
  },
  "byDate": [
    {
      "date": "2026-03-24",
      "totalAmount": 500,
      "paymentCount": 2,
      "validCount": 2,
      "overpaidCount": 0,
      "underpaidCount": 0,
      "uniqueStudentCount": 2
    }
  ]
}
```

**Response `200 OK` (CSV)** — `Content-Disposition: attachment; filename="school-payment-report_2026-01-01_2026-03-31.csv"`

```
Generated At,2026-03-24T10:00:00.000Z
Period Start,2026-01-01
Period End,2026-03-31

--- Summary ---
Total Amount,1250
Total Payments,5
Valid Payments,4
Overpaid,1
Underpaid,0
Fully Paid Students,4

--- Daily Breakdown ---
Date,Total Amount,Payment Count,Valid,Overpaid,Underpaid,Unique Students
2026-03-24,500,2,2,0,0,2
```

**Validation errors `400`**

```json
{ "error": "startDate must be before or equal to endDate", "code": "VALIDATION_ERROR" }
```

---

## Health Check

```
GET /health
```

Simple liveness probe. Returns `200` when the server is running.

**Example request**

```bash
curl http://localhost:5000/health
```

**Response `200 OK`**

```json
{ "status": "ok" }
```

---

## Error Responses

All errors return a JSON body with `error` (human-readable message) and `code`
(machine-readable identifier).

```json
{ "error": "Human-readable description", "code": "ERROR_CODE" }
```

### Error Code Reference

| Code                   | HTTP Status | Description                                                  |
|------------------------|-------------|--------------------------------------------------------------|
| `VALIDATION_ERROR`     | 400         | Request body or query parameter failed validation            |
| `TX_FAILED`            | 400         | Stellar transaction failed on-chain                          |
| `MISSING_MEMO`         | 400         | Transaction has no memo field                                |
| `INVALID_DESTINATION`  | 400         | Transaction was sent to a different wallet                   |
| `UNSUPPORTED_ASSET`    | 400         | Payment made in an asset not in the accepted list            |
| `AMOUNT_TOO_LOW`       | 400         | Payment amount is below `MIN_PAYMENT_AMOUNT`                 |
| `AMOUNT_TOO_HIGH`      | 400         | Payment amount exceeds `MAX_PAYMENT_AMOUNT`                  |
| `NOT_FOUND`            | 404         | Requested resource does not exist                            |
| `DUPLICATE_TX`         | 409         | Transaction hash has already been recorded                   |
| `STELLAR_NETWORK_ERROR`| 502         | Stellar Horizon API is unreachable or returned an error      |
| `INTERNAL_ERROR`       | 500         | Unexpected server error                                      |

### Validation Error Format

Middleware validation failures (invalid body fields) return an `errors` array
instead of a single `error` string:

```json
{
  "errors": [
    "studentId must be 3–20 alphanumeric characters",
    "name is required"
  ]
}
```
