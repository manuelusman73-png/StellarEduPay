'use strict';

/**
 * Stellar Testnet Integration Tests
 *
 * These tests run against the real Stellar testnet and require:
 *   - RUN_INTEGRATION_TESTS=true
 *   - Network access to horizon-testnet.stellar.org and friendbot.stellar.org
 *
 * They are intentionally excluded from normal CI runs.
 *
 * Run manually with:
 *   RUN_INTEGRATION_TESTS=true npx jest tests/stellar.integration.test.js --forceExit
 */

const ENABLED = process.env.RUN_INTEGRATION_TESTS === 'true';

// Skip entire suite when flag is not set
const describeIf = ENABLED ? describe : describe.skip;

// ── Dependencies (only loaded when tests are enabled) ─────────────────────────
let StellarSdk, Keypair, Networks, TransactionBuilder, Operation, Asset,
    BASE_FEE, Memo, server, syncPaymentsForSchool, extractValidPayment;

if (ENABLED) {
  StellarSdk        = require('@stellar/stellar-sdk');
  ({ Keypair, Networks, TransactionBuilder, Operation, Asset, BASE_FEE, Memo } = StellarSdk);

  // Point directly at testnet Horizon — bypass app config entirely
  server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

  // Set env vars required by stellarService before importing it
  process.env.MONGO_URI             = process.env.MONGO_URI || 'mongodb://localhost:27017/stellaredupay_integration_test';
  process.env.SCHOOL_WALLET_ADDRESS = process.env.SCHOOL_WALLET_ADDRESS || 'PLACEHOLDER';
  process.env.STELLAR_NETWORK       = 'testnet';

  ({ syncPaymentsForSchool, extractValidPayment } = require('../backend/src/services/stellarService'));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fund a testnet account via Friendbot.
 * Friendbot returns 10 000 test XLM on first call; subsequent calls top it up.
 */
async function fundViaFriendbot(publicKey) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Friendbot failed (${res.status}): ${body}`);
  }
  return res.json();
}

/**
 * Submit a payment on the testnet from `senderKeypair` to `destinationPublicKey`.
 * Returns the transaction hash.
 */
async function submitTestPayment({ senderKeypair, destinationPublicKey, amount, memo }) {
  const senderAccount = await server.loadAccount(senderKeypair.publicKey());

  const tx = new TransactionBuilder(senderAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: destinationPublicKey,
        asset: Asset.native(),
        amount: String(amount),
      }),
    )
    .addMemo(Memo.text(memo))
    .setTimeout(30)
    .build();

  tx.sign(senderKeypair);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

/**
 * Poll Horizon until the transaction appears (up to `maxWaitMs`).
 */
async function waitForTransaction(txHash, maxWaitMs = 30_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      return await server.transactions().transaction(txHash).call();
    } catch {
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  throw new Error(`Transaction ${txHash} not found on testnet after ${maxWaitMs}ms`);
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describeIf('Stellar Testnet Integration', () => {
  // Wallets created fresh for each test run
  let senderKeypair;    // pays fees
  let schoolKeypair;    // receives payments (acts as school wallet)

  const STUDENT_ID  = 'INTEG_STU001';
  const PAYMENT_XLM = '10';

  // Increase timeout — testnet can be slow
  jest.setTimeout(60_000);

  beforeAll(async () => {
    senderKeypair = Keypair.random();
    schoolKeypair = Keypair.random();

    console.log('Integration test wallets:');
    console.log('  Sender (payer) :', senderKeypair.publicKey());
    console.log('  School (receiver):', schoolKeypair.publicKey());

    // Fund both wallets via Friendbot in parallel
    await Promise.all([
      fundViaFriendbot(senderKeypair.publicKey()),
      fundViaFriendbot(schoolKeypair.publicKey()),
    ]);

    console.log('Both wallets funded via Friendbot.');
  });

  // ── Friendbot ──────────────────────────────────────────────────────────────

  describe('Friendbot setup', () => {
    test('sender wallet has a positive XLM balance after funding', async () => {
      const account = await server.loadAccount(senderKeypair.publicKey());
      const xlmBalance = account.balances.find((b) => b.asset_type === 'native');
      expect(xlmBalance).toBeDefined();
      expect(parseFloat(xlmBalance.balance)).toBeGreaterThan(0);
    });

    test('school wallet has a positive XLM balance after funding', async () => {
      const account = await server.loadAccount(schoolKeypair.publicKey());
      const xlmBalance = account.balances.find((b) => b.asset_type === 'native');
      expect(xlmBalance).toBeDefined();
      expect(parseFloat(xlmBalance.balance)).toBeGreaterThan(0);
    });
  });

  // ── Transaction submission ─────────────────────────────────────────────────

  describe('Real transaction submission', () => {
    let txHash;

    test('submits a payment with a text memo to the school wallet', async () => {
      txHash = await submitTestPayment({
        senderKeypair,
        destinationPublicKey: schoolKeypair.publicKey(),
        amount: PAYMENT_XLM,
        memo: STUDENT_ID,
      });

      expect(typeof txHash).toBe('string');
      expect(txHash).toHaveLength(64);
      console.log('  Submitted tx:', txHash);
    });

    test('transaction is confirmed on the testnet ledger', async () => {
      // txHash set by previous test — Jest runs tests in order within a describe
      const tx = await waitForTransaction(txHash);
      expect(tx.successful).toBe(true);
      expect(tx.memo).toBe(STUDENT_ID);
      expect(tx.memo_type).toBe('text');
    });
  });

  // ── extractValidPayment ────────────────────────────────────────────────────

  describe('extractValidPayment against real transaction', () => {
    let txHash;

    beforeAll(async () => {
      txHash = await submitTestPayment({
        senderKeypair,
        destinationPublicKey: schoolKeypair.publicKey(),
        amount: '5',
        memo: STUDENT_ID,
      });
      // Wait for confirmation before inspecting
      await waitForTransaction(txHash);
    });

    test('returns a valid result for a real MEMO_TEXT transaction', async () => {
      const tx = await server.transactions().transaction(txHash).call();
      const result = await extractValidPayment(tx, schoolKeypair.publicKey());

      expect(result).not.toBeNull();
      expect(result.memo).toBe(STUDENT_ID);
      expect(result.asset.assetCode).toBe('XLM');
      expect(parseFloat(result.payOp.amount)).toBe(5);
    });

    test('returns null for a transaction with a non-text memo type', async () => {
      // Build a tx with MEMO_ID instead of MEMO_TEXT
      const senderAccount = await server.loadAccount(senderKeypair.publicKey());
      const tx = new TransactionBuilder(senderAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: schoolKeypair.publicKey(),
            asset: Asset.native(),
            amount: '1',
          }),
        )
        .addMemo(Memo.id('12345'))   // MEMO_ID — should be rejected
        .setTimeout(30)
        .build();

      tx.sign(senderKeypair);
      const result = await server.submitTransaction(tx);
      const memoIdTxHash = result.hash;

      await waitForTransaction(memoIdTxHash);
      const memoIdTx = await server.transactions().transaction(memoIdTxHash).call();

      const extracted = await extractValidPayment(memoIdTx, schoolKeypair.publicKey());
      expect(extracted).toBeNull();
    });
  });

  // ── syncPaymentsForSchool ──────────────────────────────────────────────────

  describe('syncPaymentsForSchool against real testnet', () => {
    test('completes without throwing when called with a real school object', async () => {
      // syncPaymentsForSchool requires MongoDB + PaymentIntent records to fully
      // record payments. Here we verify it runs end-to-end without crashing
      // against real Horizon responses (it will find no matching intents and
      // return gracefully).
      const school = {
        schoolId: 'INTEG_SCHOOL_001',
        stellarAddress: schoolKeypair.publicKey(),
      };

      await expect(syncPaymentsForSchool(school)).resolves.toBeDefined();
    });
  });
});
