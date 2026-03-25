# StellarEduPay

A decentralized school fee payment system built on the Stellar blockchain. Parents pay school fees digitally; every transaction is recorded transparently and immutably on-chain — eliminating manual reconciliation, reducing fraud, and giving schools and parents instant, verifiable proof of payment.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Running Tests](#running-tests)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Future Scope](#future-scope)

---

## How It Works

1. **Admin creates a fee structure** for each class (`POST /api/fees`)
2. **Admin registers students** — fee is auto-assigned from the class fee structure (`POST /api/students`)
3. **Parent requests payment instructions** — receives the school wallet address, memo (student ID), and accepted assets (`GET /api/payments/instructions/:studentId`)
4. **Parent sends XLM or USDC** to the school wallet with the student ID as the memo field
5. **Admin syncs the ledger** — backend queries Horizon, matches memos to students, validates amounts, and records payments (`POST /api/payments/sync`)
6. **Payment is confirmed** — student's `feePaid` status updates; transaction hash is stored for audit

---

## Project Structure

```
StellarEduPay/
├── backend/
│   └── src/
│       ├── app.js
│       ├── config/stellarConfig.js      # Horizon server, accepted assets
│       ├── controllers/
│       ├── models/
│       ├── routes/
│       └── services/
│           └── stellarService.js        # Ledger sync, tx verification, fee validation
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       └── services/api.js
├── tests/
│   ├── payment.test.js                  # API integration tests
│   └── stellar.test.js                  # Stellar service unit tests
├── scripts/
│   └── create-school-wallet.js
├── docs/
│   ├── architecture.md                  # System design and data flow
│   ├── api-spec.md                      # Full API reference
│   └── stellar-integration.md           # Stellar-specific details
└── docker-compose.yml
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Stellar Network (Testnet / Mainnet) |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| Frontend | Next.js (React) |
| Testing | Jest, Supertest |
| DevOps | Docker, Docker Compose |

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or [Atlas](https://www.mongodb.com/atlas))
- A Stellar wallet — generate one at [Stellar Laboratory](https://laboratory.stellar.org) (use Friendbot to fund it on testnet)

### 1. Generate a school wallet

```bash
node scripts/create-school-wallet.js
```

Copy the **public key** — this is your `SCHOOL_WALLET_ADDRESS`. Never share the secret key.

### 2. Configure environment variables

**`backend/.env`**
```
MONGO_URI=mongodb://localhost:27017/stellaredupay
STELLAR_NETWORK=testnet
SCHOOL_WALLET_ADDRESS=your_school_stellar_public_key
PORT=5000
```

**`frontend/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 3. Run locally

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

### 4. Run with Docker

```bash
SCHOOL_WALLET_ADDRESS=your_wallet_address docker-compose up
```

### 5. Seed initial data (optional)

```bash
# Create a fee structure for a class
curl -X POST http://localhost:5000/api/fees \
  -H "Content-Type: application/json" \
  -d '{"className": "5A", "feeAmount": 250, "academicYear": "2026"}'

# Register a student
curl -X POST http://localhost:5000/api/students \
  -H "Content-Type: application/json" \
  -d '{"studentId": "STU001", "name": "Alice Johnson", "class": "5A"}'
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string |
| `STELLAR_NETWORK` | Yes | `testnet` or `mainnet` |
| `SCHOOL_WALLET_ADDRESS` | Yes | School's Stellar public key |
| `PORT` | No | Backend port (default: 5000) |
| `MIN_PAYMENT_AMOUNT` | No | Minimum payment amount (default: 0.01) |
| `MAX_PAYMENT_AMOUNT` | No | Maximum payment amount (default: 100000) |
| `NEXT_PUBLIC_API_URL` | Yes (frontend) | Backend API base URL |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/students` | Register a student |
| GET | `/api/students` | List all students |
| GET | `/api/students/:studentId` | Get a student |
| POST | `/api/fees` | Create / update a fee structure |
| GET | `/api/fees` | List all fee structures |
| GET | `/api/fees/:className` | Get fee for a class |
| GET | `/api/payments/instructions/:studentId` | Get wallet address + memo |
| POST | `/api/payments/verify` | Verify a transaction by hash |
| POST | `/api/payments/sync` | Sync latest payments from ledger |
| GET | `/api/payments/:studentId` | Get payment history |
| GET | `/api/payments/accepted-assets` | List accepted assets |
| GET | `/api/payments/limits` | Get payment limits configuration |

See [`docs/api-spec.md`](docs/api-spec.md) for full request/response examples.

---

## Running Tests

```bash
# From the project root
npm install
npm test
```

Expected output:
```
PASS tests/stellar.test.js
PASS tests/payment.test.js

Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
```

Tests cover:
- **`stellar.test.js`** — unit tests for `stellarService`: asset detection, fee validation, amount normalization, transaction verification, ledger sync
- **`payment.test.js`** — API integration tests: full payment flow (register → instructions → verify → history), all endpoints, edge cases

All tests mock the Stellar SDK and MongoDB — no real network or database required.

---

## Documentation

| Doc | Description |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | System design, component overview, data flow |
| [`docs/api-spec.md`](docs/api-spec.md) | Full API reference with request/response examples |
| [`docs/stellar-integration.md`](docs/stellar-integration.md) | Memo field, accepted assets, fee validation, testnet setup |
| [`docs/payment-limits.md`](docs/payment-limits.md) | Configurable payment limits for security |

---

## Future Scope

- **Hostel & exam fee payments** — separate fee categories per student
- **Scholarship disbursement** — outbound XLM payments to student wallets
- **Donation tracking** — transparent fund collection for school projects
- **Multi-school support** — isolated wallet and student records per institution
- **Email/SMS notifications** — alert parents when payment is confirmed on-chain

---

## License

MIT

---

## Contributing
Please read [](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.
