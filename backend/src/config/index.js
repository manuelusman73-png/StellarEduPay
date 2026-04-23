"use strict";

/**
 * Unified configuration loader.
 *
 * Multi-school note: SCHOOL_WALLET_ADDRESS is no longer required at startup.
 * Each school's Stellar address is stored in the School document in MongoDB.
 * The variable is still read here (optional) to support the migration script
 * (scripts/migrate-default-school.js) which seeds the first school from it.
 */

// ── Required variables ────────────────────────────────────────────────────────
const REQUIRED = ["MONGO_URI"];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(
    `[Config] Missing required environment variables: ${missing.join(", ")}\n` +
      "Check your .env file against .env.example.",
  );
}

const PORT = parseInt(process.env.PORT || "5000", 10);
const MONGO_URI = process.env.MONGO_URI;
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";
const IS_TESTNET = STELLAR_NETWORK !== "mainnet";

const HORIZON_URL =
  process.env.HORIZON_URL ||
  (IS_TESTNET
    ? "https://horizon-testnet.stellar.org"
    : "https://horizon.stellar.org");

// Optional — only used by the migration script to seed the default school
const SCHOOL_WALLET_ADDRESS = process.env.SCHOOL_WALLET_ADDRESS || null;

const USDC_ISSUER =
  process.env.USDC_ISSUER ||
  (IS_TESTNET
    ? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
    : "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");

// Which asset the school accepts: 'XLM' (default) or 'USDC'
const ACCEPTED_ASSET = (process.env.ACCEPTED_ASSET || "XLM").toUpperCase();

const CONFIRMATION_THRESHOLD = parseInt(
  process.env.CONFIRMATION_THRESHOLD || "2",
  10,
);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10);

// SYNC_INTERVAL_MS is the canonical env var for auto-sync interval.
// Falls back to POLL_INTERVAL_MS for backwards compatibility.
// Set to 0 to disable auto-sync entirely.
const _syncRaw =
  process.env.SYNC_INTERVAL_MS ?? process.env.POLL_INTERVAL_MS ?? "60000";
const SYNC_INTERVAL_MS = parseInt(_syncRaw, 10);

// ── Retry Service ─────────────────────────────────────────────────────────────
const RETRY_INTERVAL_MS = parseInt(
  process.env.RETRY_INTERVAL_MS || "60000",
  10,
);
const RETRY_MAX_ATTEMPTS = parseInt(process.env.RETRY_MAX_ATTEMPTS || "10", 10);

// ── Payment Limits ────────────────────────────────────────────────────────────
const MIN_PAYMENT_AMOUNT = parseFloat(process.env.MIN_PAYMENT_AMOUNT || "0.01");
const MAX_PAYMENT_AMOUNT = parseFloat(
  process.env.MAX_PAYMENT_AMOUNT || "100000",
);

// ── Concurrent Payment Processor ─────────────────────────────────────────────
const MAX_QUEUE_DEPTH = parseInt(process.env.MAX_QUEUE_DEPTH || "1000", 10);

if (MIN_PAYMENT_AMOUNT < 0) {
  throw new Error("[Config] MIN_PAYMENT_AMOUNT must be a positive number");
}
if (MAX_PAYMENT_AMOUNT <= MIN_PAYMENT_AMOUNT) {
  throw new Error(
    "[Config] MAX_PAYMENT_AMOUNT must be greater than MIN_PAYMENT_AMOUNT",
  );
}

// ── Timeouts ──────────────────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = parseInt(
  process.env.REQUEST_TIMEOUT_MS || "30000",
  10,
);
const STELLAR_TIMEOUT_MS = parseInt(
  process.env.STELLAR_TIMEOUT_MS || "10000",
  10,
);

// ── Auth ──────────────────────────────────────────────────────────────────────
// Secret used to sign/verify admin JWTs. Must be set in production.
const JWT_SECRET = process.env.JWT_SECRET || null;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

// ── Fee Reminders ─────────────────────────────────────────────────────────────
// How often the scheduler checks for unpaid fees (default: 24 hours)
const REMINDER_INTERVAL_MS = parseInt(
  process.env.REMINDER_INTERVAL_MS || String(24 * 60 * 60 * 1000),
  10,
);
// Minimum hours between reminders for the same student (default: 48 hours)
const REMINDER_COOLDOWN_HOURS = parseInt(
  process.env.REMINDER_COOLDOWN_HOURS || "48",
  10,
);
// Maximum reminders to send per student before stopping (default: 5)
const REMINDER_MAX_COUNT = parseInt(process.env.REMINDER_MAX_COUNT || "5", 10);

// SMTP settings for nodemailer
const SMTP_HOST = process.env.SMTP_HOST || null;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || null;
const SMTP_PASS = process.env.SMTP_PASS || null;
const SMTP_FROM = process.env.SMTP_FROM || "noreply@stellaredupay.com";

// ── Freeze to prevent accidental mutation at runtime ─────────────────────────
const config = Object.freeze({
  PORT,
  MONGO_URI,
  STELLAR_NETWORK,
  IS_TESTNET,
  HORIZON_URL,
  SCHOOL_WALLET_ADDRESS,
  USDC_ISSUER,
  ACCEPTED_ASSET,
  CONFIRMATION_THRESHOLD,
  POLL_INTERVAL_MS,
  SYNC_INTERVAL_MS,
  RETRY_INTERVAL_MS,
  RETRY_MAX_ATTEMPTS,
  MIN_PAYMENT_AMOUNT,
  MAX_PAYMENT_AMOUNT,
  MAX_QUEUE_DEPTH,
  REQUEST_TIMEOUT_MS,
  STELLAR_TIMEOUT_MS,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  REMINDER_INTERVAL_MS,
  REMINDER_COOLDOWN_HOURS,
  REMINDER_MAX_COUNT,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
});

module.exports = config;
