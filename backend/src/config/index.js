'use strict';

/**
 * Unified configuration loader.
 *
 * Multi-school note: SCHOOL_WALLET_ADDRESS is no longer required at startup.
 * Each school's Stellar address is stored in the School document in MongoDB.
 * The variable is still read here (optional) to support the migration script
 * (scripts/migrate-default-school.js) which seeds the first school from it.
 */

const REQUIRED = ['MONGO_URI'];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(
    `[Config] Missing required environment variables: ${missing.join(', ')}\n` +
    'Check your .env file against .env.example.'
  );
}

const PORT            = parseInt(process.env.PORT || '5000', 10);
const MONGO_URI       = process.env.MONGO_URI;
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const IS_TESTNET      = STELLAR_NETWORK !== 'mainnet';

const HORIZON_URL =
  process.env.HORIZON_URL ||
  (IS_TESTNET ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org');

// Optional — only used by the migration script to seed the default school
const SCHOOL_WALLET_ADDRESS = process.env.SCHOOL_WALLET_ADDRESS || null;

const USDC_ISSUER =
  process.env.USDC_ISSUER ||
  (IS_TESTNET
    ? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
    : 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN');

const CONFIRMATION_THRESHOLD = parseInt(process.env.CONFIRMATION_THRESHOLD || '2', 10);
const POLL_INTERVAL_MS       = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);

// ── Polling ───────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);

// ── Payment Limits ────────────────────────────────────────────────────────────
// Minimum payment amount (default: 0.01 XLM/USDC)
const MIN_PAYMENT_AMOUNT = parseFloat(process.env.MIN_PAYMENT_AMOUNT || '0.01');

// Maximum payment amount (default: 100000 XLM/USDC)
const MAX_PAYMENT_AMOUNT = parseFloat(process.env.MAX_PAYMENT_AMOUNT || '100000');

// Validate payment limits
if (MIN_PAYMENT_AMOUNT < 0) {
  throw new Error('[Config] MIN_PAYMENT_AMOUNT must be a positive number');
}

if (MAX_PAYMENT_AMOUNT <= MIN_PAYMENT_AMOUNT) {
  throw new Error('[Config] MAX_PAYMENT_AMOUNT must be greater than MIN_PAYMENT_AMOUNT');
}
// ── Timeouts ──────────────────────────────────────────────────────────────────
// Maximum time (ms) an incoming HTTP request may remain open before the server
// responds with 503. Covers slow Stellar/DB calls on any route.
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);

// Maximum time (ms) allowed for a single outbound Stellar Horizon API call.
const STELLAR_TIMEOUT_MS = parseInt(process.env.STELLAR_TIMEOUT_MS || '10000', 10);

// ── Freeze to prevent accidental mutation at runtime ─────────────────────────
const config = Object.freeze({
  PORT,
  MONGO_URI,
  STELLAR_NETWORK,
  IS_TESTNET,
  HORIZON_URL,
  SCHOOL_WALLET_ADDRESS,
  USDC_ISSUER,
  CONFIRMATION_THRESHOLD,
  POLL_INTERVAL_MS,
  MIN_PAYMENT_AMOUNT,
  MAX_PAYMENT_AMOUNT,
  REQUEST_TIMEOUT_MS,
  STELLAR_TIMEOUT_MS,
});

module.exports = config;
