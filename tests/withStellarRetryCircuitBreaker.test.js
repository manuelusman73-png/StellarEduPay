'use strict';

/**
 * Tests for withStellarRetry circuit breaker behaviour (Issue #370).
 *
 * Verifies that:
 *  - Transient errors (network, 5xx, 429) are retried with backoff.
 *  - Permanent 4xx errors (404, 400) are NOT retried — thrown immediately.
 *  - 429 (rate-limited) IS retried.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';

// Speed up tests — no real sleeping
jest.mock('../backend/src/utils/logger', () => ({
  child: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

// Patch sleep so tests don't actually wait
jest.mock('../backend/src/utils/withStellarRetry', () => {
  const actual = jest.requireActual('../backend/src/utils/withStellarRetry');
  return actual;
}, { virtual: false });

function makeHorizonError(status) {
  const err = new Error(`Horizon ${status}`);
  err.response = { status };
  return err;
}

function makeNetworkError(code) {
  const err = new Error(`Network error: ${code}`);
  err.code = code;
  return err;
}

describe('withStellarRetry — circuit breaker', () => {
  let withStellarRetry;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    // Re-require after resetting modules so env changes take effect
    ({ withStellarRetry } = require('../backend/src/utils/withStellarRetry'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper: run withStellarRetry while advancing fake timers to skip backoff
  async function run(fn, opts = {}) {
    const promise = withStellarRetry(fn, { maxAttempts: 3, baseDelay: 10, ...opts });
    // Advance timers to skip all backoff delays
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(100000);
      await Promise.resolve();
    }
    return promise;
  }

  test('transient network error (ECONNREFUSED) is retried', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(makeNetworkError('ECONNREFUSED'))
      .mockRejectedValueOnce(makeNetworkError('ECONNREFUSED'))
      .mockResolvedValueOnce('ok');

    const result = await run(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('5xx server error is retried', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(makeHorizonError(503))
      .mockResolvedValueOnce('ok');

    const result = await run(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('429 (rate-limited) is retried', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(makeHorizonError(429))
      .mockResolvedValueOnce('ok');

    const result = await run(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('404 is NOT retried — thrown immediately after first attempt', async () => {
    const err404 = makeHorizonError(404);
    const fn = jest.fn().mockRejectedValue(err404);

    await expect(run(fn)).rejects.toThrow('Horizon 404');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('400 is NOT retried — thrown immediately after first attempt', async () => {
    const err400 = makeHorizonError(400);
    const fn = jest.fn().mockRejectedValue(err400);

    await expect(run(fn)).rejects.toThrow('Horizon 400');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('existing callers receive the error unchanged for permanent failures', async () => {
    const err = makeHorizonError(404);
    err.myCustomProp = 'preserved';
    const fn = jest.fn().mockRejectedValue(err);

    const thrown = await run(fn).catch((e) => e);

    expect(thrown.myCustomProp).toBe('preserved');
    expect(thrown.response.status).toBe(404);
  });
});
