# Stellar Integration

## How It Works

StellarEduPay uses the **Stellar Horizon API** to read blockchain transactions — no private key is ever held by the backend. The school wallet is read-only from the backend's perspective; only the school administrator controls it via their own Stellar wallet app.

## The Memo Field

Stellar transactions support an optional **memo** field (up to 28 characters). StellarEduPay uses this to embed the student ID in every payment:

```
Parent sends:  250 XLM  →  GSCHOOL_WALLET_ADDRESS  (memo: "STU001")
```

When the backend syncs, it reads the memo and matches it to a registered student — no manual reconciliation needed.

## Accepted Assets

The system accepts **XLM** (native) and **USDC** by default. Assets are configured in `backend/src/config/stellarConfig.js`:

```js
const ACCEPTED_ASSETS = {
  XLM:  { code: 'XLM',  type: 'native',           issuer: null },
  USDC: { code: 'USDC', type: 'credit_alphanum4',  issuer: '...' },
};
```

To add a new asset, add an entry here. Transactions with unlisted assets are silently skipped during sync.

## Fee Validation

After matching a transaction to a student, the backend compares the paid amount against the student's `feeAmount`:

| Result | Condition | `feePaid` updated? |
|---|---|---|
| `valid` | amount == feeAmount | ✅ Yes |
| `overpaid` | amount > feeAmount | ✅ Yes |
| `underpaid` | amount < feeAmount | ❌ No |
| `unknown` | student not found | ❌ No |

## Testnet vs Mainnet

Controlled by the `STELLAR_NETWORK` environment variable:

```
STELLAR_NETWORK=testnet   # default — uses horizon-testnet.stellar.org
STELLAR_NETWORK=mainnet   # uses horizon.stellar.org
```

To get a free testnet wallet with test XLM, use [Stellar Laboratory](https://laboratory.stellar.org) → Generate Keypair → Fund with Friendbot.

## Generating a School Wallet

```bash
node scripts/create-school-wallet.js
```

Copy the **public key** into your `.env` as `SCHOOL_WALLET_ADDRESS`. Keep the secret key offline — the backend never needs it.

## Verifying a Payment Independently

Any payment can be verified on a public Stellar explorer without using this app:

- Testnet: https://stellar.expert/explorer/testnet
- Mainnet: https://stellar.expert/explorer/public

Search by transaction hash or the school wallet address.
