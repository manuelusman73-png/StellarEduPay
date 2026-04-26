# Fix: Sync Summary, Destination Validation, Wallet Script, Test Page

Closes #461, #462, #463, #464

## Summary

Four fixes across the backend and frontend:
- #462: Sync endpoint now returns a detailed summary instead of just `{ message: "Sync complete" }`
- #463: Explicit destination address validation added to sync loop with logging for wrong-destination transactions
- #461: Wallet creation script added to `backend/package.json` scripts; README updated with correct command
- #464: `test-currency.jsx` does not exist in the codebase — no action required
# Fix: Audit Logging, Indexes, Backup Verification, Dispute Resolution

Closes #457, #458, #459, #460

## Summary

Four related infrastructure and audit improvements:
- #457: Payment verification attempts now logged to audit trail
- #458: Student model indexes already exist, added migration script to ensure they're created on deployed databases
- #459: Backup script now verifies integrity and sends alerts on failure
- #460: Dispute resolution now extracts `resolvedBy` from authenticated admin instead of requiring it in request body

## Changes

### New Files

| File | Description |
| ---- | ----------- |
| [`backend/src/services/stellarService.js`](backend/src/services/stellarService.js) | `syncPaymentsForSchool` now tracks and returns a summary object; explicit destination check with warning log |
| [`backend/src/controllers/paymentController.js`](backend/src/controllers/paymentController.js) | `syncAllPayments` returns the summary from `syncPaymentsForSchool` |
| [`backend/package.json`](backend/package.json) | Added `create-wallet` script: `npm run create-wallet` |
| [`README.md`](README.md) | Updated wallet script instructions to show `cd backend && npm run create-wallet` as the primary command |
| [`docs/api-spec.md`](docs/api-spec.md) | Updated sync endpoint response schema with full summary shape |

## Implementation Details

### #462 — Sync Summary Response

`syncPaymentsForSchool` now returns:

```json
{
  "found": 12,
  "new": 3,
  "matched": 2,
  "unmatched": 1,
  "failed": 0,
  "alreadyProcessed": 9,
  "failedDetails": [{ "txHash": "abc...", "reason": "UNDERPAID: ..." }]
}
```

| Field | Description |
|---|---|
| `found` | Total transactions fetched from Horizon |
| `new` | Transactions not previously seen |
| `matched` | Matched to a student via PaymentIntent |
| `unmatched` | No matching intent or student |
| `failed` | Failed validation (underpaid, wrong destination, limit exceeded) |
| `alreadyProcessed` | Already recorded — sync stopped here |
| `failedDetails` | `[{ txHash, reason }]` for each failure |

### #463 — Destination Address Validation

`extractValidPayment` already filters `op.to === walletAddress`, but the sync loop now adds an explicit second check after extraction as defence-in-depth. Wrong-destination transactions are:
- Logged as a warning with `txHash`, `destination`, and `expected` address
- Counted in `summary.failed` with reason `INVALID_DESTINATION: payment sent to <addr>`
- Never recorded as payments

### #461 — Wallet Script

The script already resolves `@stellar/stellar-sdk` from `./backend/node_modules` so it works from the project root. Added `npm run create-wallet` to `backend/package.json` as the cleaner entry point and updated the README to show it as the primary option.

### #464 — Test Currency Page

`frontend/src/pages/test-currency.jsx` does not exist in the repository. No action required.

## Acceptance Criteria

### #462
- [x] Response includes `{ found, new, matched, unmatched, failed, alreadyProcessed }`
- [x] Each field is a count of transactions in that category
- [x] `failedDetails` includes `[{ txHash, reason }]` for failed transactions
- [x] API spec updated

### #463
- [x] Destination address validated against `school.stellarAddress` for each transaction
- [x] Transactions with wrong destination are skipped and logged
- [x] Error code `INVALID_DESTINATION` included in `failedDetails.reason`

### #461
- [x] Script added to `backend/package.json` scripts as `create-wallet`
- [x] README updated with correct command

### #464
- [x] Page does not exist — no production exposure
| [`backend/migrations/002_add_student_indexes.js`](backend/migrations/002_add_student_indexes.js) | Migration script to ensure `{ schoolId: 1, class: 1 }` and `{ schoolId: 1, feePaid: 1 }` indexes exist |

### Modified Files

| File | Description |
| ---- | ----------- |
| [`backend/src/controllers/paymentController.js`](backend/src/controllers/paymentController.js) | Added comprehensive audit logging to `verifyPayment` — logs all attempts (success, failure, cached, queued) with IP, user agent, duration |
| [`backend/src/controllers/dispute.controller.js`](backend/src/controllers/dispute.controller.js) | `resolveDispute` now extracts `resolvedBy` from `req.user` (JWT payload) instead of request body |
| [`scripts/backup.sh`](scripts/backup.sh) | Added verification: checks file size > `MIN_BACKUP_SIZE`, runs `mongorestore --dryRun`, sends webhook alert on failure |
| [`backend/.env.example`](backend/.env.example) | Documented `BACKUP_DIR`, `RETAIN_DAYS`, `MIN_BACKUP_SIZE`, `WEBHOOK_URL` |

## Implementation Details

### #457 — Payment Verification Audit Logging

Every `POST /api/payments/verify` call now creates an audit log entry with:
- `action: 'payment_verify'`
- `performedBy`: extracted from JWT (`req.user.email` / `req.user.id`) or `'anonymous'`
- `targetId`: transaction hash
- `details`: includes `txHash`, `studentId`, `amount`, `feeValidationStatus`, `duration`, error codes
- `result`: `'success'` or `'failure'`
- `ipAddress` and `userAgent` from request

Logged scenarios:
- Validation failure (invalid hash format)
- Cached result (payment already recorded)
- Permanent failure (TX_FAILED, MISSING_MEMO, etc.)
- Queued for retry (transient Stellar network error)
- Not found (no valid payment to school wallet)
- Student not found
- Intent expired
- Underpaid
- Successful verification
- Unexpected errors

### #458 — Student Model Indexes

The indexes already exist in `studentModel.js` (lines 88-89):
```js
studentSchema.index({ schoolId: 1, class: 1 });
studentSchema.index({ schoolId: 1, feePaid: 1 });
```

Added migration script to ensure they're created on deployed databases that may have been initialized before the indexes were added to the schema.

### #459 — Backup Verification

`scripts/backup.sh` now:
1. Checks `mongodump` exit code
2. Verifies backup file exists
3. Checks file size >= `MIN_BACKUP_SIZE` (default 1024 bytes)
4. Runs `mongorestore --archive=<file> --gzip --dryRun` to verify integrity
5. Sends webhook alert on any failure (optional `WEBHOOK_URL` env var)
6. Deletes corrupt backups immediately

Webhook payload:
```json
{
  "text": "[StellarEduPay Backup] <error message>",
  "timestamp": "20260324T100000Z"
}
```

Compatible with Slack, Discord, Microsoft Teams, and generic webhooks.

### #460 — Dispute Resolution Audit

`resolveDispute` now extracts `resolvedBy` from the authenticated admin's JWT payload:
```js
const resolvedBy = user?.email || user?.id || user?.sub || 'admin';
```

The `resolvedBy` field is no longer accepted in the request body — it's always set from the authenticated user context. This prevents spoofing and ensures accurate audit trails.

## Acceptance Criteria

### #457
- [x] Verification attempt logged to auditService with: txHash, result, ip, timestamp
- [x] Both successful and failed verifications are logged
- [x] Audit log entry visible in `GET /api/audit-logs`

### #458
- [x] Index `{ schoolId: 1, class: 1 }` exists in student schema
- [x] Index `{ schoolId: 1, feePaid: 1 }` exists in student schema
- [x] Migration script adds indexes to existing collection

### #459
- [x] Backup script checks that output file size is greater than 0
- [x] `mongorestore --dryRun` run on the backup to verify integrity
- [x] Failure sends an alert (log entry + optional webhook notification)
- [x] README documents backup verification process

### #460
- [x] `resolvedBy` and `resolvedAt` fields exist in disputeModel.js
- [x] `PATCH /api/disputes/:id/resolve` sets both fields from the authenticated admin
- [x] Audit log entry created for dispute resolution (via existing audit trail)

## Testing

Run the migration:
```bash
node backend/migrations/002_add_student_indexes.js
```

Test backup verification:
```bash
MONGO_URI=mongodb://localhost:27017/stellaredupay \
BACKUP_DIR=./test-backups \
MIN_BACKUP_SIZE=1024 \
WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
./scripts/backup.sh
```

Verify audit logs after payment verification:
```bash
curl -X POST http://localhost:5000/api/payments/verify \
  -H "Content-Type: application/json" \
  -H "X-School-ID: SCH-3F2A" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"txHash":"<64-char-hex>"}'

curl http://localhost:5000/api/audit-logs?action=payment_verify \
  -H "Authorization: Bearer <admin-token>" \
  -H "X-School-ID: SCH-3F2A"
```
