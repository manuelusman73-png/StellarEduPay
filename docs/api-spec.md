# API Reference

Base URL: `http://localhost:5000/api`

---

## Students

### Register a student
```
POST /api/students
```
Body:
```json
{ "studentId": "STU001", "name": "Alice Johnson", "class": "5A", "feeAmount": 250 }
```
> `feeAmount` is optional if a fee structure exists for the class — it will be auto-assigned.

Response `201`:
```json
{ "studentId": "STU001", "name": "Alice Johnson", "class": "5A", "feeAmount": 250, "feePaid": false }
```

### List all students
```
GET /api/students
```

### Get a student
```
GET /api/students/:studentId
```

---

## Payments

### Get payment instructions
```
GET /api/payments/instructions/:studentId
```
Response `200`:
```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "memo": "STU001",
  "acceptedAssets": [
    { "code": "XLM", "type": "native", "displayName": "Stellar Lumens" },
    { "code": "USDC", "type": "credit_alphanum4", "displayName": "USD Coin" }
  ],
  "note": "Include the student ID exactly as the memo when sending payment."
}
```

### Verify a transaction
```
POST /api/payments/verify
```
Body:
```json
{ "txHash": "your_transaction_hash" }
```
Response `200`:
```json
{
  "hash": "abc123...",
  "memo": "STU001",
  "amount": 250,
  "feeAmount": 250,
  "feeValidation": { "status": "valid", "message": "Payment matches the required fee" },
  "date": "2026-03-23T10:00:00Z"
}
```
`feeValidation.status` is one of: `valid` | `underpaid` | `overpaid` | `unknown`

### Sync payments from ledger
```
POST /api/payments/sync
```
Fetches the 20 most recent transactions to the school wallet, matches memos to students, and records new payments.

Response `200`:
```json
{ "message": "Sync complete" }
```

### Get payment history for a student
```
GET /api/payments/:studentId
```

### List accepted assets
```
GET /api/payments/accepted-assets
```

---

## Fee Structures

### Create / update a fee structure
```
POST /api/fees
```
Body:
```json
{ "className": "5A", "feeAmount": 250, "description": "Grade 5A annual fees", "academicYear": "2026" }
```

### List all fee structures
```
GET /api/fees
```

### Get fee for a class
```
GET /api/fees/:className
```

### Deactivate a fee structure
```
DELETE /api/fees/:className
```
