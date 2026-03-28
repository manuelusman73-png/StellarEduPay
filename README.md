# StellarEduPay

A decentralized school fee payment system built on the Stellar blockchain network. StellarEduPay enables transparent, immutable, and verifiable school fee payments — eliminating manual reconciliation, reducing fraud, and providing instant proof of payment for both schools and parents.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📋 Table of Contents

- [Problem Statement](#-problem-statement)
- [Solution Overview](#-solution-overview)
- [How Stellar Integration Works](#-how-stellar-integration-works)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Application](#running-the-application)
- [Environment Variables](#-environment-variables)
- [API Usage Examples](#-api-usage-examples)
- [Testing](#-testing)
- [Project Structure](#-project-structure)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Problem Statement

Traditional school fee payment systems face several challenges:

- **Manual Reconciliation**: Schools spend hours matching bank deposits to student records
- **Lack of Transparency**: Parents have no immediate proof of payment
- **Fraud Risk**: Paper receipts can be forged or lost
- **Delayed Confirmation**: Bank transfers take days to confirm
- **High Transaction Fees**: Traditional payment processors charge significant fees
- **Poor Audit Trail**: Difficult to track payment history and generate reports

## 💡 Solution Overview

StellarEduPay leverages the **Stellar blockchain network** to solve these problems:

1. **Instant Verification**: Payments are confirmed on the blockchain within 3-5 seconds
2. **Immutable Records**: Every transaction is permanently recorded and cannot be altered
3. **Automatic Reconciliation**: Student IDs embedded in transaction memos enable automatic matching
4. **Low Fees**: Stellar transactions cost a fraction of a cent
5. **Transparent Audit Trail**: Anyone can verify payments on public blockchain explorers
6. **Multi-Asset Support**: Accept payments in XLM (Stellar Lumens) or USDC (stablecoin)

---

## 🌟 How Stellar Integration Works

### The Stellar Blockchain

[Stellar](https://stellar.org) is a decentralized, open-source blockchain network designed for fast, low-cost financial transactions. Unlike traditional payment systems, Stellar:

- Confirms transactions in **3-5 seconds**
- Charges **0.00001 XLM per transaction** (~$0.000001)
- Supports **multiple currencies** (XLM, USDC, and custom tokens)
- Provides **public transaction records** for transparency

### Payment Flow with Stellar

```
┌─────────────┐
│   Parent    │
│   Wallet    │
└──────┬──────┘
       │ 1. Send XLM/USDC with student ID as memo
       │
       ▼
┌─────────────────────────────────────────┐
│      Stellar Blockchain Network         │
│  (Transaction recorded immutably)       │
└──────┬──────────────────────────────────┘
       │ 2. Transaction confirmed in 3-5 seconds
       │
       ▼
┌─────────────┐
│   School    │
│   Wallet    │
└──────┬──────┘
       │ 3. Backend syncs from Horizon API
       │
       ▼
┌─────────────────────────────────────────┐
│      StellarEduPay Backend              │
│  • Reads transaction from blockchain    │
│  • Extracts memo (student ID)           │
│  • Validates amount against fee         │
│  • Updates student payment status       │
└─────────────────────────────────────────┘
```

### The Memo Field: Automatic Payment Matching

Stellar transactions include an optional **memo field** (up to 28 characters). StellarEduPay uses this to embed the student ID:

```
Transaction Details:
  From:   Parent's Wallet (GPARENT...)
  To:     School Wallet (GSCHOOL...)
  Amount: 250 XLM
  Memo:   "STU001"  ← Student ID for automatic matching
```

When the backend syncs transactions, it:
1. Reads the memo field
2. Matches it to a registered student
3. Validates the amount against the student's fee
4. Automatically updates the payment status

**No manual reconciliation needed!**

### Read-Only Integration

**Important**: The backend never holds or requires the school's private key. It only:
- **Reads** transactions from the public Stellar Horizon API
- **Verifies** payment amounts and memos
- **Records** payment metadata in MongoDB

The school administrator controls the wallet privately through their own Stellar wallet application.

### Accepted Assets

StellarEduPay accepts two types of payments:

| Asset | Type | Description |
|-------|------|-------------|
| **XLM** | Native | Stellar's native cryptocurrency (Lumens) |
| **USDC** | Stablecoin | USD-pegged stablecoin for price stability |

Assets are configured in [`backend/src/config/stellarConfig.js`](backend/src/config/stellarConfig.js). Additional assets can be added by updating the configuration.

### Testnet vs Mainnet

- **Testnet**: For development and testing (free test XLM from Friendbot)
- **Mainnet**: For production with real assets

Controlled by the `STELLAR_NETWORK` environment variable.

---

## ✨ Key Features

- ✅ **Blockchain-Based Payments**: Immutable, transparent transaction records
- ✅ **Automatic Reconciliation**: Student ID memos enable instant payment matching
- ✅ **Multi-Asset Support**: Accept XLM or USDC payments
- ✅ **Fee Validation**: Automatic detection of underpayments, overpayments, and exact matches
- ✅ **Payment Limits**: Configurable min/max thresholds for security
- ✅ **Transaction Verification**: Verify any payment by transaction hash
- ✅ **Payment History**: Complete audit trail for each student
- ✅ **Retry Mechanism**: Automatic retry for failed verifications during network outages
- ✅ **Background Polling**: Continuous sync of new payments from the blockchain
- ✅ **RESTful API**: Clean, documented endpoints for all operations
- ✅ **Comprehensive Testing**: Full test coverage with Jest

---

## 🏗️ Architecture

StellarEduPay is a three-tier application:

```
┌──────────────────────────────────────────────────────────────┐
│                     Parent/Admin Browser                      │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                   Next.js Frontend (React)                    │
│  • Payment forms  • Student dashboard  • Reports             │
└────────────────────────┬─────────────────────────────────────┘
                         │ REST API
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              Express.js Backend (Node.js)                     │
│  • Payment controller  • Stellar service  • Validation       │
└─────────┬────────────────────────────────────┬───────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────┐          ┌────────────────────────────┐
│      MongoDB        │          │   Stellar Horizon API      │
│  • Students         │          │  • Transaction ledger      │
│  • Payments         │          │  • Account operations      │
│  • Fee structures   │          │  • Asset information       │
└─────────────────────┘          └────────────────────────────┘
```

### Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| **Express App** | [`backend/src/app.js`](backend/src/app.js) | HTTP server, route mounting, error handling |
| **Stellar Service** | [`backend/src/services/stellarService.js`](backend/src/services/stellarService.js) | Ledger sync, transaction verification, fee validation |
| **Stellar Config** | [`backend/src/config/stellarConfig.js`](backend/src/config/stellarConfig.js) | Horizon server, accepted assets, network configuration |
| **Payment Controller** | [`backend/src/controllers/paymentController.js`](backend/src/controllers/paymentController.js) | Payment instructions, verification, sync endpoints |
| **Student Controller** | [`backend/src/controllers/studentController.js`](backend/src/controllers/studentController.js) | Student CRUD, automatic fee assignment |
| **Fee Controller** | [`backend/src/controllers/feeController.js`](backend/src/controllers/feeController.js) | Fee structure management |
| **Retry Service** | [`backend/src/services/retryService.js`](backend/src/services/retryService.js) | Automatic retry for failed verifications |
| **Transaction Service** | [`backend/src/services/transactionService.js`](backend/src/services/transactionService.js) | Background polling for new payments |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Blockchain** | Stellar Network | Payment ledger and transaction processing |
| **Backend** | Node.js + Express | REST API server |
| **Database** | MongoDB + Mongoose | Student records and payment metadata |
| **Frontend** | Next.js (React) | User interface |
| **Blockchain SDK** | Stellar SDK | Horizon API integration |
| **Testing** | Jest + Supertest | Unit and integration tests |
| **DevOps** | Docker + Docker Compose | Containerization and deployment |

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18 or higher ([Download](https://nodejs.org/))
- **npm** 9 or higher (bundled with Node.js)
- **MongoDB** 4.4 or higher ([Download](https://www.mongodb.com/try/download/community) or use [MongoDB Atlas](https://www.mongodb.com/atlas))
- **Git** ([Download](https://git-scm.com/downloads))
- **Docker + Docker Compose v2** (optional, for containerized deployment) ([Download](https://www.docker.com/get-started))

### Installation

#### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/StellarEduPay.git
cd StellarEduPay
```

#### Step 2: Generate a School Wallet

You need a Stellar wallet to receive payments. Generate one using the Stellar Laboratory:

**Option A: Using Stellar Laboratory (Recommended for beginners)**

1. Visit [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)
2. Click "Generate keypair"
3. Copy the **Public Key** (starts with `G...`) — this is your `SCHOOL_WALLET_ADDRESS`
4. **Securely save the Secret Key** (starts with `S...`) — never share this or commit it to version control
5. Click "Fund account with Friendbot" to get free test XLM (testnet only)

**Option B: Using the provided script**

```bash
# Install backend dependencies first if you haven't already
cd backend && npm install && cd ..

node scripts/create-school-wallet.js
```

This will output:
```
Public Key:  GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Secret Key:  SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

⚠️  Save the secret key securely! The backend only needs the public key.
```

#### Step 3: Install Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd ../frontend
npm install
```

**Root (for tests):**
```bash
cd ..
npm install
```

### Configuration

#### Step 4: Configure Backend Environment Variables

Create a `.env` file in the `backend/` directory:

Create your local environment file by copying the unified template:

```bash
cp .env.example .env
```

Open `.env` and configure your credentials (e.g., set `SCHOOL_WALLET_ADDRESS` slightly generated above).

For the frontend, specify the backend API URL in **`frontend/.env.local`**:
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your configuration:

```bash
# ── Required ────────────────────────────────────────────────
# MongoDB connection string
MONGO_URI=mongodb://localhost:27017/stellaredupay

# School's Stellar public key (from Step 2)
SCHOOL_WALLET_ADDRESS=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# ── Stellar Network ──────────────────────────────────────────
# Use "testnet" for development, "mainnet" for production
STELLAR_NETWORK=testnet

# ── Server ───────────────────────────────────────────────────
PORT=5000

# ── Payment Limits (Optional) ─────────────────────────────────
# Minimum payment amount in XLM/USDC
MIN_PAYMENT_AMOUNT=0.01

# Maximum payment amount in XLM/USDC
MAX_PAYMENT_AMOUNT=100000

# ── Background Jobs (Optional) ────────────────────────────────
# How often to poll for new payments (milliseconds)
POLL_INTERVAL_MS=30000

# How often to retry failed verifications (milliseconds)
RETRY_INTERVAL_MS=60000

# Maximum retry attempts before giving up
RETRY_MAX_ATTEMPTS=10
```

#### Step 5: Configure Frontend Environment Variables

Create a `.env.local` file in the `frontend/` directory:

```bash
cd ../frontend
cp .env.local.example .env.local
```

Edit `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### Running the Application

#### Option A: Run Locally (Development)

**Terminal 1 - Start MongoDB** (if running locally):
```bash
mongod --dbpath /path/to/your/data/directory
```

**Terminal 2 - Start Backend**:
```bash
cd backend
npm run dev
```

You should see:
```
MongoDB connected
Server running on port 5000
Background polling started (interval: 30000ms)
Retry worker started (interval: 60000ms)
```

**Terminal 3 - Start Frontend**:
```bash
cd frontend
npm run dev
```

Visit **http://localhost:3000** in your browser.

#### Option B: Run with Docker Compose

```bash
# From the project root — replace the value with your actual public key
SCHOOL_WALLET_ADDRESS=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX docker compose up --build
```

> On older Docker installations, use `docker-compose` (with a hyphen) instead of `docker compose`.

This will start:
- MongoDB on port 27017
- Backend on port 5000
- Frontend on port 3000

### Initial Setup: Seed Data

Once the application is running, seed some initial data:

**1. Create a fee structure:**
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

**2. Register a student:**
```bash
curl -X POST http://localhost:5000/api/students \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "STU001",
    "name": "Alice Johnson",
    "class": "Grade 5A"
  }'
```

The student's fee will be automatically assigned from the class fee structure.

**3. Get payment instructions:**
```bash
curl http://localhost:5000/api/payments/instructions/STU001
```

Response:
```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "memo": "STU001",
  "acceptedAssets": [
    { "code": "XLM", "type": "native", "displayName": "Stellar Lumens" },
    { "code": "USDC", "type": "credit_alphanum4", "displayName": "USD Coin" }
  ],
  "paymentLimits": {
    "min": 0.01,
    "max": 100000
  },
  "note": "Include the student ID exactly as the memo when sending payment."
}
```

**4. Make a test payment:**

Use a Stellar wallet (e.g., [Stellar Laboratory](https://laboratory.stellar.org/#txbuilder?network=test)) to send XLM to the school wallet address with memo `STU001`.

**5. Sync payments:**
```bash
curl -X POST http://localhost:5000/api/payments/sync
```

The backend will fetch recent transactions from the Stellar network and automatically match them to students.

---

## 🔐 Environment Variables

### Backend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` | ✅ Yes | - | MongoDB connection string (e.g., `mongodb://localhost:27017/stellaredupay`) |
| `SCHOOL_WALLET_ADDRESS` | ✅ Yes | - | School's Stellar public key (starts with `G...`) |
| `STELLAR_NETWORK` | ✅ Yes | `testnet` | Stellar network: `testnet` or `mainnet` |
| `PORT` | No | `5000` | Backend server port |
| `HORIZON_URL` | No | Auto | Stellar Horizon API URL (auto-detected from network) |
| `USDC_ISSUER` | No | Auto | USDC issuer address (auto-detected from network) |
| `MIN_PAYMENT_AMOUNT` | No | `0.01` | Minimum payment amount in XLM/USDC |
| `MAX_PAYMENT_AMOUNT` | No | `100000` | Maximum payment amount in XLM/USDC |
| `POLL_INTERVAL_MS` | No | `30000` | Background polling interval (milliseconds) |
| `RETRY_INTERVAL_MS` | No | `60000` | Retry worker interval (milliseconds) |
| `RETRY_MAX_ATTEMPTS` | No | `10` | Maximum retry attempts for failed verifications |

### Frontend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ Yes | - | Backend API base URL (e.g., `http://localhost:5000/api`) |

### Configuration Validation

The application validates configuration on startup:
- `MIN_PAYMENT_AMOUNT` must be positive (> 0)
- `MAX_PAYMENT_AMOUNT` must be greater than `MIN_PAYMENT_AMOUNT`
- `SCHOOL_WALLET_ADDRESS` must be a valid Stellar public key

If validation fails, the application will not start and will display a clear error message.

---

## 📡 API Usage Examples

### Students

#### Register a Student
```bash
POST /api/students
Content-Type: application/json

{
  "studentId": "STU001",
  "name": "Alice Johnson",
  "class": "Grade 5A"
}
```

Response `201`:
```json
{
  "studentId": "STU001",
  "name": "Alice Johnson",
  "class": "Grade 5A",
  "feeAmount": 250,
  "feePaid": false
}
```

#### Get All Students
```bash
GET /api/students
```

#### Get a Specific Student
```bash
GET /api/students/STU001
```

### Fee Structures

#### Create a Fee Structure
```bash
POST /api/fees
Content-Type: application/json

{
  "className": "Grade 5A",
  "feeAmount": 250,
  "description": "Annual tuition fees",
  "academicYear": "2026"
}
```

#### Get All Fee Structures
```bash
GET /api/fees
```

#### Get Fee for a Class
```bash
GET /api/fees/Grade%205A
```

### Payments

#### Get Payment Instructions
```bash
GET /api/payments/instructions/STU001
```

Response `200`:
```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "memo": "STU001",
  "acceptedAssets": [
    {
      "code": "XLM",
      "type": "native",
      "displayName": "Stellar Lumens"
    },
    {
      "code": "USDC",
      "type": "credit_alphanum4",
      "displayName": "USD Coin"
    }
  ],
  "paymentLimits": {
    "min": 0.01,
    "max": 100000
  },
  "note": "Include the student ID exactly as the memo when sending payment."
}
```

#### Verify a Transaction
```bash
POST /api/payments/verify
Content-Type: application/json

{
  "txHash": "abc123def456..."
}
```

Response `200`:
```json
{
  "hash": "abc123def456...",
  "memo": "STU001",
  "amount": 250,
  "feeAmount": 250,
  "feeValidation": {
    "status": "valid",
    "message": "Payment matches the required fee"
  },
  "date": "2026-03-24T10:00:00Z"
}
```

**Fee Validation Statuses:**
- `valid`: Payment exactly matches the required fee
- `overpaid`: Payment exceeds the required fee (still accepted)
- `underpaid`: Payment is less than required (not accepted)
- `unknown`: Student not found or memo missing

#### Sync Payments from Blockchain
```bash
POST /api/payments/sync
```

Fetches the 20 most recent transactions to the school wallet, matches memos to students, validates amounts, and records new payments.

Response `200`:
```json
{
  "message": "Sync complete"
}
```

#### Get Payment History for a Student
```bash
GET /api/payments/STU001
```

Response `200`:
```json
[
  {
    "txHash": "abc123...",
    "amount": 250,
    "feeAmount": 250,
    "feeValidationStatus": "valid",
    "memo": "STU001",
    "confirmedAt": "2026-03-24T10:00:00Z"
  }
]
```

#### Get Accepted Assets
```bash
GET /api/payments/accepted-assets
```

Response `200`:
```json
[
  {
    "code": "XLM",
    "type": "native",
    "displayName": "Stellar Lumens"
  },
  {
    "code": "USDC",
    "type": "credit_alphanum4",
    "displayName": "USD Coin"
  }
]
```

#### Get Payment Limits
```bash
GET /api/payments/limits
```

Response `200`:
```json
{
  "min": 0.01,
  "max": 100000,
  "message": "Payment amounts must be between 0.01 and 100000"
}
```

### Error Responses

All errors follow a consistent format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

**Common Error Codes:**
- `NOT_FOUND`: Resource not found (404)
- `VALIDATION_ERROR`: Invalid request data (400)
- `DUPLICATE_TX`: Transaction already recorded (409)
- `TX_FAILED`: Transaction failed on Stellar network (400)
- `MISSING_MEMO`: Transaction missing required memo field (400)
- `INVALID_DESTINATION`: Transaction sent to wrong wallet (400)
- `UNSUPPORTED_ASSET`: Payment made in unsupported asset (400)
- `AMOUNT_TOO_LOW`: Payment below minimum limit (400)
- `AMOUNT_TOO_HIGH`: Payment exceeds maximum limit (400)
- `STELLAR_NETWORK_ERROR`: Stellar Horizon API unavailable (502)

---

## 🧪 Testing

StellarEduPay includes comprehensive test coverage for all core functionality.

### Run All Tests

Tests mock both the Stellar SDK and MongoDB — no real network or database required.

```bash
# From the project root — install root dependencies first if you haven't already
npm install

npm test
```

Expected output:

```
PASS tests/stellar.test.js
PASS tests/payment.test.js
PASS tests/payment-limits.test.js

Test Suites: 3 passed, 3 total
Tests:       45 passed, 45 total
Snapshots:   0 total
Time:        5.234s
```

### Test Files

| Test File | Coverage |
|-----------|----------|
| [`tests/stellar.test.js`](tests/stellar.test.js) | Stellar service: asset detection, fee validation, amount normalization, transaction verification, ledger sync |
| [`tests/payment.test.js`](tests/payment.test.js) | Payment API: full payment flow, all endpoints, edge cases, error handling |
| [`tests/payment-limits.test.js`](tests/payment-limits.test.js) | Payment limits: validation, boundary cases, error codes |

### Run Specific Tests

```bash
# Test Stellar service only
npm test tests/stellar.test.js

# Test payment API only
npm test tests/payment.test.js

# Test payment limits only
npm test tests/payment-limits.test.js
```

### Test Coverage

All tests use mocks for:
- **Stellar SDK**: No real blockchain network calls
- **MongoDB**: In-memory database for isolation
- **HTTP requests**: Supertest for API testing

This ensures tests run quickly and don't require external dependencies.

---

## 📁 Project Structure

```
StellarEduPay/
├── backend/                          # Backend Node.js application
│   ├── src/
│   │   ├── app.js                    # Express server setup
│   │   ├── config/
│   │   │   ├── index.js              # Environment configuration
│   │   │   └── stellarConfig.js      # Stellar network configuration
│   │   ├── controllers/
│   │   │   ├── feeController.js      # Fee structure endpoints
│   │   │   ├── paymentController.js  # Payment endpoints
│   │   │   ├── reportController.js   # Report generation
│   │   │   └── studentController.js  # Student CRUD endpoints
│   │   ├── middleware/
│   │   │   └── validate.js           # Request validation middleware
│   │   ├── models/
│   │   │   ├── feeStructureModel.js  # Fee structure schema
│   │   │   ├── paymentModel.js       # Payment schema
│   │   │   ├── paymentIntentModel.js # Payment intent schema
│   │   │   ├── pendingVerificationModel.js # Retry queue schema
│   │   │   └── studentModel.js       # Student schema
│   │   ├── routes/
│   │   │   ├── feeRoutes.js          # Fee structure routes
│   │   │   ├── paymentRoutes.js      # Payment routes
│   │   │   ├── reportRoutes.js       # Report routes
│   │   │   └── studentRoutes.js      # Student routes
│   │   ├── services/
│   │   │   ├── reportService.js      # Report generation logic
│   │   │   ├── retryService.js       # Automatic retry mechanism
│   │   │   ├── stellarService.js     # Stellar blockchain integration
│   │   │   └── transactionService.js # Background polling
│   │   └── utils/
│   │       └── paymentLimits.js      # Payment limit validation
│   ├── .env.example                  # Example environment variables
│   └── package.json                  # Backend dependencies
│
├── frontend/                         # Next.js frontend application
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx            # Navigation component
│   │   │   ├── PaymentForm.jsx       # Payment form component
│   │   │   ├── ReportDownload.jsx    # Report download component
│   │   │   └── TransactionCard.jsx   # Transaction display component
│   │   ├── pages/
│   │   │   ├── index.jsx             # Home page
│   │   │   ├── dashboard.jsx         # Student dashboard
│   │   │   ├── pay-fees.jsx          # Payment page
│   │   │   └── reports.jsx           # Reports page
│   │   ├── services/
│   │   │   └── api.js                # API client
│   │   └── styles/
│   │       └── globals.css           # Global styles
│   ├── .env.example                  # Example environment variables
│   └── package.json                  # Frontend dependencies
│
├── docs/                             # Documentation
│   ├── api-spec.md                   # Full API reference
│   ├── architecture.md               # System architecture
│   ├── payment-limits.md             # Payment limits documentation
│   └── stellar-integration.md        # Stellar integration details
│
├── scripts/
│   └── create-school-wallet.js       # Wallet generation script
│
├── tests/                            # Test suite
│   ├── payment.test.js               # Payment API tests
│   ├── payment-limits.test.js        # Payment limits tests
│   └── stellar.test.js               # Stellar service tests
│
├── .gitignore                        # Git ignore rules
├── CONTRIBUTING.md                   # Contribution guidelines
├── docker-compose.yml                # Docker Compose configuration
├── package.json                      # Root package.json for tests
└── README.md                         # This file
```

---

## 📚 Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

| Document | Description |
|----------|-------------|
| [`docs/architecture.md`](docs/architecture.md) | System design, component overview, data flow diagrams |
| [`docs/api-spec.md`](docs/api-spec.md) | Complete API reference with request/response examples |
| [`docs/stellar-integration.md`](docs/stellar-integration.md) | Stellar-specific details: memo field, assets, testnet setup |
| [`docs/payment-limits.md`](docs/payment-limits.md) | Payment limits feature: configuration, security, troubleshooting |

---

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on:

- Code of conduct
- Development workflow
- Pull request process
- Coding standards

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

---

## 🔮 Future Enhancements

- **Multi-School Support**: Isolated wallets and records per institution
- **Email/SMS Notifications**: Alert parents when payments are confirmed
- **Scholarship Disbursement**: Outbound XLM payments to student wallets
- **Hostel & Exam Fees**: Separate fee categories per student
- **Donation Tracking**: Transparent fund collection for school projects
- **Mobile App**: Native iOS/Android applications
- **Admin Dashboard**: Enhanced analytics and reporting
- **Recurring Payments**: Automatic payment scheduling
- **Multi-Currency Support**: Additional stablecoins (EURC, etc.)

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## 🆘 Support

If you encounter any issues or have questions:

1. Check the [Documentation](docs/)
2. Search [existing issues](https://github.com/yourusername/StellarEduPay/issues)
3. Open a [new issue](https://github.com/yourusername/StellarEduPay/issues/new) with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)

---

## 🙏 Acknowledgments

- [Stellar Development Foundation](https://stellar.org) for the blockchain infrastructure
- [MongoDB](https://www.mongodb.com) for the database platform
- [Next.js](https://nextjs.org) for the frontend framework
- All contributors who help improve this project

---

## 🌐 Useful Links

- **Stellar Network**: https://stellar.org
- **Stellar Laboratory**: https://laboratory.stellar.org
- **Stellar Horizon API**: https://developers.stellar.org/api
- **Stellar Explorer (Testnet)**: https://stellar.expert/explorer/testnet
- **Stellar Explorer (Mainnet)**: https://stellar.expert/explorer/public
- **MongoDB Atlas**: https://www.mongodb.com/atlas

---
## 🛠 Troubleshooting & Pitfalls

If you encounter issues during setup, check the table below for common Stellar-specific errors and their solutions.

| Error | Likely Cause | Solution |
| :--- | :--- | :--- |
| `tx_insufficient_balance` | The Stellar account in your `.env` has 0 XLM. | Go to the [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=testnet) and use **Friendbot** to fund your Secret Key. |
| `op_no_trust` | The recipient hasn't established a trustline for your custom asset. | Ensure the `ChangeTrust` operation is submitted by the student/user account before attempting to send tokens. |
| `connection refused` | The MongoDB container is down or the URI is incorrect. | Run `docker ps` to ensure the `mongo` container is healthy. If running the backend natively, ensure `MONGO_URI` points to `localhost:27017`. |
| `tx_bad_auth` | The `STELLAR_SECRET_KEY` does not match the public address being used. | Double-check your `.env` file to ensure the Secret Key corresponds to the correct Public Key. |

### 🔍 Viewing Logs
If the containers are running but the API isn't responding, check the real-time logs:
```bash
docker-compose logs -f backend

---

**Built with ❤️ using Stellar blockchain technology**
