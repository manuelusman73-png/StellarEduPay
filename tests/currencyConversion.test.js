'use strict';

/**
 * Tests for currencyConversionService
 *
 * Covers:
 *   - Fresh cache hit (no network call)
 *   - Cache miss → successful CoinGecko fetch
 *   - Stale cache served when feed is down
 *   - Fully unavailable feed (no cache) → graceful null return
 *   - XLM vs USDC rate selection
 *   - Per-currency independent caching
 *   - convertToLocalCurrency precision (2 dp)
 *   - enrichPaymentWithConversion shape
 *   - formatWithLocalEquivalent strings
 *   - Back-compat aliases (fetchXlmRate, convertXlmToLocal)
 */

const assert = require('assert');
const https  = require('https');

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Monkey-patch https.get for one call, restore after.
 * handler(url) should call (res) callback with a fake IncomingMessage.
 */
function mockHttpsGet(responseBody, statusCode = 200) {
  const original = https.get;
  https.get = (url, opts, callback) => {
    // opts may be omitted (older Node signature)
    const cb = typeof opts === 'function' ? opts : callback;
    const fakeRes = {
      statusCode,
      on(event, fn) {
        if (event === 'data') fn(JSON.stringify(responseBody));
        if (event === 'end')  fn();
        return this;
      },
      resume() {},
    };
    cb(fakeRes);
    return { on() { return this; } };
  };
  return () => { https.get = original; };
}

function mockHttpsGetError(errorMessage) {
  const original = https.get;
  https.get = (_url, _opts, _cb) => {
    const req = {
      on(event, fn) {
        if (event === 'error') process.nextTick(() => fn(new Error(errorMessage)));
        return this;
      },
    };
    return req;
  };
  return () => { https.get = original; };
}

// ── test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

it('currencyConversionService suite', async () => {
(async () => {
  console.log('\nCurrencyConversionService\n');
  // Fresh require so cache starts empty
  delete require.cache[require.resolve('../backend/src/services/currencyConversionService')];
  const svc = require('../backend/src/services/currencyConversionService');

  // ── 1. Successful fetch + cache population ──────────────────────────────

  await test('fetches XLM and USDC rates and returns correct USD amount', async () => {
    svc.resetCache();
    const restore = mockHttpsGet({ stellar: { usd: 0.24 }, 'usd-coin': { usd: 1.00 } });
    try {
      const result = await svc.convertToLocalCurrency(10, 'XLM', 'USD');
      assert.strictEqual(result.available, true);
      assert.strictEqual(result.currency, 'USD');
      assert.strictEqual(result.localAmount, 2.40);   // 10 * 0.24 = 2.40
      assert.strictEqual(result.rate, 0.24);
      assert.ok(result.rateTimestamp, 'rateTimestamp should be set');
    } finally {
      restore();
    }
  });

  await test('uses USDC rate for USDC asset code', async () => {
    svc.resetCache();
    const restore = mockHttpsGet({ stellar: { usd: 0.24 }, 'usd-coin': { usd: 1.00 } });
    try {
      const result = await svc.convertToLocalCurrency(50, 'USDC', 'USD');
      assert.strictEqual(result.available, true);
      assert.strictEqual(result.localAmount, 50.00);  // 50 * 1.00
      assert.strictEqual(result.rate, 1.00);
    } finally {
      restore();
    }
  });

  // ── 2. Cache hit (no second HTTP call) ──────────────────────────────────

  await test('returns cached rate without making a network call', async () => {
    // Cache is already populated from the test above (USD).
    // If https.get is called it will throw.
    https.get = () => { throw new Error('Should not hit network — cache should be used'); };
    try {
      const result = await svc.convertToLocalCurrency(5, 'XLM', 'USD');
      assert.strictEqual(result.available, true);
      assert.strictEqual(result.localAmount, 1.20); // 5 * 0.24
    } finally {
      https.get = require('https').get; // noop — original already restored above
    }
    // Restore the real https.get
    delete require.cache[require.resolve('https')];
  });

  // ── 3. Per-currency independent caching ─────────────────────────────────

  await test('fetches a separate rate for a different currency (PGK)', async () => {
    const restore = mockHttpsGet({ stellar: { pgk: 0.89 }, 'usd-coin': { pgk: 3.71 } });
    try {
      const result = await svc.convertToLocalCurrency(10, 'XLM', 'PGK');
      assert.strictEqual(result.available, true);
      assert.strictEqual(result.currency, 'PGK');
      assert.strictEqual(result.localAmount, 8.90);  // 10 * 0.89
    } finally {
      restore();
    }
  });

  await test('USD cache is still intact after PGK fetch', async () => {
    const cached = svc.getCachedRates();
    assert.ok(cached['USD'], 'USD cache entry should still exist');
    assert.ok(cached['PGK'], 'PGK cache entry should now exist');
  });

  // ── 4. Graceful degradation: feed unavailable, no cache ─────────────────

  await test('returns available:false when feed is unavailable and cache is empty', async () => {
    svc.resetCache();
    const restore = mockHttpsGetError('ENOTFOUND api.coingecko.com');
    try {
      const result = await svc.convertToLocalCurrency(10, 'XLM', 'EUR');
      assert.strictEqual(result.available, false);
      assert.strictEqual(result.localAmount, null);
      assert.strictEqual(result.rate, null);
      assert.strictEqual(result.rateTimestamp, null);
    } finally {
      restore();
    }
  });

  // ── 5. Stale cache served when feed is down ──────────────────────────────

  await test('serves stale cache when feed is down and cache exists', async () => {
    // Seed a stale-ish cache entry manually
    svc.resetCache();
    const restore1 = mockHttpsGet({ stellar: { usd: 0.20 }, 'usd-coin': { usd: 1.00 } });
    await svc.convertToLocalCurrency(1, 'XLM', 'USD');  // populates cache
    restore1();

    // Now make the feed fail
    const restore2 = mockHttpsGetError('Network down');
    // Force TTL expiry by reaching into the internal cache and back-dating fetchedAt
    const internalCache = svc._getCache();
    internalCache['USD'].fetchedAt = new Date(Date.now() - 999999);

    try {
      const result = await svc.convertToLocalCurrency(10, 'XLM', 'USD');
      // Should still return a value from the stale cache
      assert.strictEqual(result.available, true, 'Should serve stale cache as fallback');
      assert.ok(result.localAmount !== null);
    } finally {
      restore2();
    }
  });

  // ── 6. enrichPaymentWithConversion shape ─────────────────────────────────

  await test('enrichPaymentWithConversion adds localCurrency field to payment', async () => {
    svc.resetCache();
    const restore = mockHttpsGet({ stellar: { usd: 0.24 }, 'usd-coin': { usd: 1.00 } });
    try {
      const payment = { txHash: 'abc123', amount: 100, assetCode: 'XLM', studentId: 'STU001' };
      const enriched = await svc.enrichPaymentWithConversion(payment, 'USD');

      assert.ok(enriched.localCurrency, 'localCurrency block should exist');
      assert.strictEqual(enriched.localCurrency.currency, 'USD');
      assert.strictEqual(enriched.localCurrency.amount, 24.00);   // 100 * 0.24
      assert.strictEqual(enriched.localCurrency.available, true);
      assert.ok(enriched.localCurrency.rateTimestamp);
      // Original fields untouched
      assert.strictEqual(enriched.txHash, 'abc123');
      assert.strictEqual(enriched.amount, 100);
    } finally {
      restore();
    }
  });

  await test('enrichPaymentWithConversion falls back to XLM when assetCode missing', async () => {
    const restore = mockHttpsGet({ stellar: { usd: 0.24 }, 'usd-coin': { usd: 1.00 } });
    try {
      const payment = { amount: 10 };  // no assetCode
      const enriched = await svc.enrichPaymentWithConversion(payment, 'USD');
      assert.strictEqual(enriched.localCurrency.amount, 2.40);  // treated as XLM
    } finally {
      restore();
    }
  });

  // ── 7. formatWithLocalEquivalent strings ─────────────────────────────────

  await test('formatWithLocalEquivalent returns correct dual-currency string', async () => {
    svc.resetCache();
    const restore = mockHttpsGet({ stellar: { usd: 0.24 }, 'usd-coin': { usd: 1.00 } });
    try {
      const str = await svc.formatWithLocalEquivalent(10, 'XLM', 'USD');
      assert.strictEqual(str, '10.0000000 XLM (≈ 2.40 USD)');
    } finally {
      restore();
    }
  });

  await test('formatWithLocalEquivalent returns rate-unavailable string on feed failure', async () => {
    svc.resetCache();
    const restore = mockHttpsGetError('timeout');
    try {
      const str = await svc.formatWithLocalEquivalent(10, 'XLM', 'USD');
      assert.ok(str.includes('rate unavailable'), `Expected "rate unavailable" in: "${str}"`);
    } finally {
      restore();
    }
  });

  // ── 8. Precision: always 2 decimal places ────────────────────────────────

  await test('localAmount is rounded to exactly 2 decimal places', async () => {
    svc.resetCache();
    // Rate that produces many decimals: 10 * 0.123456789 = 1.23456789
    const restore = mockHttpsGet({ stellar: { usd: 0.123456789 }, 'usd-coin': { usd: 1.00 } });
    try {
      const result = await svc.convertToLocalCurrency(10, 'XLM', 'USD');
      const decimals = (result.localAmount.toString().split('.')[1] || '').length;
      assert.ok(decimals <= 2, `Expected <= 2 decimal places, got ${decimals}`);
      assert.strictEqual(result.localAmount, 1.23);  // toFixed(2) rounds
    } finally {
      restore();
    }
  });

  // ── 9. Back-compat alias: fetchXlmRate ───────────────────────────────────

  await test('fetchXlmRate alias returns the XLM rate number', async () => {
    svc.resetCache();
    const restore = mockHttpsGet({ stellar: { usd: 0.24 }, 'usd-coin': { usd: 1.00 } });
    try {
      const rate = await svc.fetchXlmRate('usd');
      assert.strictEqual(rate, 0.24);
    } finally {
      restore();
    }
  });

  await test('fetchXlmRate alias returns null when feed is unavailable', async () => {
    svc.resetCache();
    const restore = mockHttpsGetError('network error');
    try {
      const rate = await svc.fetchXlmRate('usd');
      assert.strictEqual(rate, null);
    } finally {
      restore();
    }
  });

  // ── 10. HTTP non-200 response ─────────────────────────────────────────────

  await test('treats HTTP 429 from CoinGecko as unavailable (graceful)', async () => {
    svc.resetCache();
    const restore = mockHttpsGet({ error: 'rate limit' }, 429);
    try {
      const result = await svc.convertToLocalCurrency(10, 'XLM', 'USD');
      assert.strictEqual(result.available, false);
    } finally {
      restore();
    }
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
}, 30000);