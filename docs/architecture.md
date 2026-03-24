# Architecture

## Overview

StellarEduPay is a three-tier application: a Next.js frontend, a Node.js/Express backend, and the Stellar blockchain as the payment ledger. MongoDB stores student records and payment metadata; the Stellar Horizon API is the source of truth for transaction data.

```
Parent Browser
      │  HTTPS
      ▼
Next.js Frontend  ──── REST API ────►  Express Backend
                                              │
                                    ┌─────────┴──────────┐
                                    ▼                    ▼
                                 MongoDB           Stellar Horizon API
                             (students, payments)   (transaction ledger)
```

## Key Components

| Component | Location | Responsibility |
|---|---|---|
| Express app | `backend/src/app.js` | HTTP server, route mounting |
| stellarService | `backend/src/services/stellarService.js` | Ledger sync, tx verification, fee validation |
| stellarConfig | `backend/src/config/stellarConfig.js` | Horizon server, accepted assets, network config |
| studentController | `backend/src/controllers/studentController.js` | Student CRUD, auto fee assignment |
| paymentController | `backend/src/controllers/paymentController.js` | Payment instructions, verify, sync |
| feeController | `backend/src/controllers/feeController.js` | Fee structure management |

## Payment Flow

```
1. Admin creates fee structure for a class  →  POST /api/fees
2. Admin registers student                  →  POST /api/students
3. Parent requests payment instructions     →  GET  /api/payments/instructions/:studentId
4. Parent sends XLM/USDC to school wallet
   with studentId as memo field
5. Admin triggers sync                      →  POST /api/payments/sync
   └─ Backend queries Horizon for recent txs
   └─ Matches memo to student record
   └─ Validates amount against fee
   └─ Saves Payment document, marks feePaid
6. Parent/admin verifies a specific tx      →  POST /api/payments/verify
```

## Data Models

**Student** — `studentId`, `name`, `class`, `feeAmount`, `feePaid`

**Payment** — `studentId`, `txHash`, `amount`, `feeAmount`, `feeValidationStatus` (`valid` | `underpaid` | `overpaid` | `unknown`), `memo`, `confirmedAt`

**FeeStructure** — `className`, `feeAmount`, `description`, `academicYear`, `isActive`
