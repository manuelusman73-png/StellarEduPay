# Stellar Integration

StellarEduPay uses the **Stellar Horizon API** to read blockchain transactions — the backend never holds or requires the school's private key. The school wallet is read-only from the backend's perspective; only the school administrator controls it via their own Stellar wallet application.

---

## Table of Contents

- [Testnet vs Mainnet](#testnet-vs-mainnet)
- [Testnet Setup for Contributors](#testnet-setup-for-contributors)
- [The Memo Field: Student Identification](#the-memo-field-student-identification)
- [Accepted Assets](#accepted-assets)
- [How syncPayments Works](#how-syncpayments-works)
- [How verifyTransaction Works](#how-verifytransaction-works)
- [Fee Validation](#fee-validation)
- [Confirmation Threshold](#confirmation-threshold)
- [Fraud & Anomaly Detection](#fraud--anomaly-detection)
- [Retry Behaviour](#retry-behaviour)
- [Verifying a Payment Independently](#verifying-a-payment-independently)

---

## Testnet vs Mainnet

Network selection is controlled by a single environment variable:

```env
STELLAR_NETWORK=testnet   # default — safe for development
STELLAR_NETWORK=mainnet   # production — real assets
```

Internally, `backend/src/config/index.js` derives everything else from this value:

```js
const IS_TESTNET  = STELLAR_NETWORK !== 'mainnet';

const HORIZON_URL =
  process.env.HORIZON_URL ||
  (IS_TESTNET
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org');

const USDC_ISSUER =
  process.env.USDC_ISSUER ||
  (IS_TESTNET
    ? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'  // testnet USDC
    : 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'); // mainnet USDC
```

The Horizon server instance is created once in `backend/src/config/stellarConfig.js` and shared across all services:

```js
const server = new StellarSdk.Horizon.Server(config.HORIZON_URL, {
  timeout: config.STELLAR_TIMEOUT_MS, // default 10 000 ms
});
```

You should never need to change `HORIZON_URL` manually — switching `STELLAR_NETWORK` is enough.

---

## Testnet Setup for Contributors

1. Visit [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test) and click **Generate keypair**.
2. Copy the **Public Key** (starts with `G`) — this is your `SCHOOL_WALLET_ADDRESS`.
3. Keep the **Secret Key** (starts with `S`) offline. The backend never needs it.
4. Click **Fund account with Friendbot** to receive free test XLM.
5. Add the public key to `backend/.env`:

```env
STELLAR_NETWORK=testnet
SCHOOL_WALLET_ADDRESS=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Alternatively, generate a wallet from the command line:

```bash
cd backend && npm install
node scripts/create-school-wallet.js
```

To send a test payment, use [Stellar Laboratory → Transaction Builder](https://laboratory.stellar.org/#txbuilder?network=test):
- **Destination**: your `SCHOOL_WALLET_ADDRESS`
- **Amount**: any value within your configured limits
- **Memo (text)**: the student ID (e.g. `STU001`)

---

## The Memo Field: Student Identification

Stellar transactions include an optional **memo** field (up to 28 characters). StellarEduPay uses this to embed the student ID so payments can be matched automatically — no manual reconciliation needed.

```
Transaction on Stellar network:
  From:   GPARENT_WALLET_ADDRESS
  To:     GSCHOOL_WALLET_ADDRESS
  Amount: 250 XLM
  Memo:   "STU001"   ← student ID
```

When the backend syncs or verifies a transaction, it:

1. Reads `tx.memo` and trims whitespace.
2. Rejects the transaction if the memo is empty (`MISSING_MEMO`).
3. Looks up a `PaymentIntent` with `{ schoolId, memo, status: 'pending' }`.
4. Resolves the student from the intent and validates the amount against their fee.

**Important constraints:**
- The memo must match a student ID exactly (case-sensitive).
- Memos are scoped to a school — the same memo value can exist across different schools without collision.
- If `MEMO_ENCRYPTION_KEY` is set in `.env`, memos are AES-256-GCM encrypted before being stored. The Stellar memo itself is always plain text; encryption only applies to the value stored in MongoDB.

---

## Accepted Assets

The system accepts one asset at a time, configured via `ACCEPTED_ASSET` (default: `XLM`):

```env
ACCEPTED_ASSET=XLM    # Stellar Lumens (native asset)
ACCEPTED_ASSET=USDC   # USD Coin (stablecoin)
```

Asset definitions live in `backend/src/config/stellarConfig.js`:

```js
const ALL_ASSETS = {
  XLM: {
    code: 'XLM',
    type: 'native',
    issuer: null,
    displayName: 'Stellar Lumens',
    decimals: 7,
  },
  USDC: {
    code: 'USDC',
    type: 'credit_alphanum4',
    issuer: config.USDC_ISSUER,   // auto-resolved per network
    displayName: 'USD Coin',
    decimals: 7,
  },
};
```

`isAcceptedAsset(assetCode, assetType)` is called on every payment operation during sync and verification. Transactions using any other asset are silently skipped.

To add a new asset, add an entry to `ALL_ASSETS` and update the `ACCEPTED_ASSET` validation list.

---

## How syncPayments Works

`syncPaymentsForSchool(school)` in `backend/src/services/stellarService.js` is the core reconciliation loop. It is called by the background polling service on the interval set by `POLL_INTERVAL_MS` (default: 30 000 ms).

### Step-by-step

**1. Fetch recent transactions from Horizon**

```js
let page = await withStellarRetry(() =>
  server
    .transactions()
    .forAccount(stellarAddress)
    .order('desc')   // newest first
    .limit(200)
    .call()
);
```

Transactions are fetched in pages of 200, newest first. Pagination continues until a previously-recorded transaction is encountered or the last page is reached.

**2. Skip already-processed transactions**

```js
const existing = await Payment.findOne({ txHash: tx.hash });
if (existing) { done = true; break; }
```

Once a known transaction is found, the loop stops — all older transactions have already been processed.

**3. Extract and validate the payment operation**

`extractValidPayment(tx, stellarAddress)` performs three checks:

```js
// a. Transaction must have succeeded on-chain
if (!tx.successful) return null;

// b. Memo must be present
const memo = tx.memo ? tx.memo.trim() : null;
if (!memo) return null;

// c. Must contain a payment operation targeting the school wallet
const payOp = ops.records.find(
  op => op.type === 'payment' && op.to === walletAddress
);
if (!payOp) return null;

// d. Asset must be accepted
const asset = detectAsset(payOp);
if (!asset) return null;
```

**4. Match to a PaymentIntent**

```js
const intent = await PaymentIntent.findOne({
  schoolId,
  memo,
  status: 'pending',
});
if (!intent) continue;
```

Only transactions with a matching pending intent are processed. This prevents arbitrary payments from being recorded.

**5. Validate payment amount**

```js
// Global min/max limits
const limitValidation = validatePaymentAmount(paymentAmount);
if (!limitValidation.valid) continue;

// Fee comparison against the intent amount
const feeValidation = validatePaymentAgainstFee(paymentAmount, intent.amount);
```

Underpaid transactions are recorded with `status: 'FAILED'` and `isSuspicious: true` but do not update the student's `feePaid` flag.

**6. Calculate cumulative payment status**

Because a student may pay in multiple instalments, the sync aggregates all previous confirmed payments:

```js
const previousTotal = previousPayments[0]?.total ?? 0;
const cumulativeTotal = parseFloat((previousTotal + paymentAmount).toFixed(7));

// 'underpaid' | 'overpaid' | 'valid'
let cumulativeStatus;
if (cumulativeTotal < student.feeAmount)      cumulativeStatus = 'underpaid';
else if (cumulativeTotal > student.feeAmount) cumulativeStatus = 'overpaid';
else                                          cumulativeStatus = 'valid';
```

**7. Check confirmation status**

```js
const isConfirmed = txLedger
  ? await checkConfirmationStatus(txLedger)
  : false;
const confirmationStatus = isConfirmed ? 'confirmed' : 'pending_confirmation';
```

See [Confirmation Threshold](#confirmation-threshold) for details.

**8. Fraud detection**

```js
const collision = await detectMemoCollision(
  memo, senderAddress, paymentAmount, student.feeAmount, txDate, schoolId
);
```

See [Fraud & Anomaly Detection](#fraud--anomaly-detection).

**9. Persist the payment record**

```js
await Payment.create({
  schoolId, studentId: intent.studentId, txHash: tx.hash,
  amount: paymentAmount, feeAmount: intent.amount,
  feeValidationStatus: cumulativeStatus, excessAmount,
  status: 'confirmed', memo, senderAddress,
  isSuspicious: collision.suspicious,
  suspicionReason: collision.reason,
  ledger: txLedger, confirmationStatus, confirmedAt: txDate,
});
```

**10. Update student record and close the intent**

Only if the transaction is confirmed and not suspicious:

```js
await Student.findOneAndUpdate(
  { schoolId, studentId: intent.studentId },
  { totalPaid: cumulativeTotal, feePaid: cumulativeTotal >= student.feeAmount }
);

await PaymentIntent.findByIdAndUpdate(intent._id, { status: 'completed' });
```

---

## How verifyTransaction Works

`verifyTransaction(txHash, walletAddress)` in `stellarService.js` is called by the payment controller when a client submits a transaction hash for manual verification (`POST /api/payments/verify`).

### Step-by-step

```js
// 1. Fetch the transaction from Horizon
const tx = await withStellarRetry(
  () => server.transactions().transaction(txHash).call()
);

// 2. Confirm it succeeded on-chain
if (tx.successful === false) throw { code: 'TX_FAILED' };

// 3. Require a non-empty memo
const memo = tx.memo ? tx.memo.trim() : null;
if (!memo) throw { code: 'MISSING_MEMO' };

// 4. Find a payment operation targeting the school wallet
const payOp = ops.records.find(
  op => op.type === 'payment' && op.to === walletAddress
);
if (!payOp) throw { code: 'INVALID_DESTINATION' };

// 5. Confirm the asset is accepted
const asset = detectAsset(payOp);
if (!asset) throw { code: 'UNSUPPORTED_ASSET' };

// 6. Validate amount against global limits
const limitValidation = validatePaymentAmount(amount);
if (!limitValidation.valid) throw { code: limitValidation.code };

// 7. Look up student and compare against their fee
const student = await Student.findOne({ studentId: memo });
const feeValidation = feeAmount != null
  ? validatePaymentAgainstFee(amount, feeAmount)
  : { status: 'unknown', message: 'Student not found' };
```

The function returns a structured result — it does **not** write to the database. Persisting the payment is the caller's responsibility.

```js
return {
  hash, memo, studentId: memo,
  amount, assetCode, assetType,
  feeAmount, feeValidation,
  networkFee,   // tx.fee_paid converted from stroops to XLM
  date, ledger, senderAddress,
};
```

### Error codes

| Code | Meaning |
|---|---|
| `TX_FAILED` | Transaction was not successful on Stellar |
| `MISSING_MEMO` | No memo on the transaction |
| `INVALID_DESTINATION` | No payment operation to the school wallet |
| `UNSUPPORTED_ASSET` | Asset not in `ACCEPTED_ASSETS` |
| `AMOUNT_TOO_LOW` | Below `MIN_PAYMENT_AMOUNT` |
| `AMOUNT_TOO_HIGH` | Above `MAX_PAYMENT_AMOUNT` |

---

## Fee Validation

`validatePaymentAgainstFee(paymentAmount, expectedFee)` compares the paid amount against the student's assigned fee:

```js
if (paymentAmount < expectedFee) {
  return { status: 'underpaid',  excessAmount: 0,      message: '...' };
}
if (paymentAmount > expectedFee) {
  return { status: 'overpaid',   excessAmount: excess, message: '...' };
}
return   { status: 'valid',      excessAmount: 0,      message: '...' };
```

| Status | `feePaid` updated? | Notes |
|---|---|---|
| `valid` | ✅ Yes | Exact match |
| `overpaid` | ✅ Yes | Excess recorded; student is considered paid |
| `underpaid` | ❌ No | Payment recorded as `FAILED`; student must pay again |
| `unknown` | ❌ No | Student not found in database |

---

## Confirmation Threshold

Stellar finalises transactions in 3–5 seconds, but StellarEduPay adds an extra safety margin by requiring a minimum number of ledgers to have closed after the transaction's ledger before marking it `confirmed`.

```env
CONFIRMATION_THRESHOLD=2   # default — wait for 2 ledgers after the tx ledger
```

```js
async function checkConfirmationStatus(txLedger) {
  const latestLedger = await withStellarRetry(
    () => server.ledgers().order('desc').limit(1).call()
  );
  const latestSequence = latestLedger.records[0].sequence;
  return (latestSequence - txLedger) >= CONFIRMATION_THRESHOLD;
}
```

Payments that have not yet met the threshold are stored with `confirmationStatus: 'pending_confirmation'`. `finalizeConfirmedPayments(schoolId)` is run periodically to promote them once the threshold is met.

---

## Fraud & Anomaly Detection

### Memo collision

`detectMemoCollision` flags a transaction as suspicious if the same memo (student ID) was used by a **different sender address** within the last 24 hours:

```js
const recentFromOtherSender = await Payment.findOne({
  schoolId,
  studentId: memo,
  senderAddress: { $ne: senderAddress },
  confirmedAt: { $gte: windowStart },  // 24-hour window
});
```

This catches cases where someone attempts to impersonate a student's payment.

### Abnormal patterns

`detectAbnormalPatterns` checks two additional signals:

- **Velocity**: the same sender makes more than 3 payments within 10 minutes.
- **Unusual amount**: the payment is more than 3× or less than 1/3 of the expected fee.

Suspicious payments are still recorded but `isSuspicious: true` prevents the student's `feePaid` flag from being updated until an admin reviews the record.

---

## Retry Behaviour

All Horizon API calls are wrapped in `withStellarRetry` (`backend/src/utils/withStellarRetry.js`), which retries transient failures with exponential backoff and jitter:

```js
const data = await withStellarRetry(
  () => server.transactions().transaction(txHash).call(),
  { label: 'verifyTransaction', maxAttempts: 3, baseDelay: 1000 }
);
```

Retried errors include network timeouts (`ETIMEDOUT`, `ECONNREFUSED`), HTTP 429 (rate-limited), and HTTP 5xx (server errors). Permanent 4xx errors are thrown immediately without retrying.

Backoff formula: `min(baseDelay × 2^(attempt-1), 10 000) + random jitter (±30%)`

Environment overrides:

```env
STELLAR_CALL_RETRY_ATTEMPTS=3     # default
STELLAR_CALL_RETRY_DELAY_MS=1000  # default initial delay
```

---

## Verifying a Payment Independently

Any transaction can be verified on a public Stellar explorer without using this application:

- Testnet: https://stellar.expert/explorer/testnet
- Mainnet: https://stellar.expert/explorer/public

Search by transaction hash or the school wallet address to see the full on-chain record.
