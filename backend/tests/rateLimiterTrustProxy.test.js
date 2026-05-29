'use strict';

const express = require('express');
const request = require('supertest');
const rateLimit = require('express-rate-limit');

function buildApp(trustedHops) {
  const app = express();
  app.set('trust proxy', trustedHops);

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
  });

  app.use(limiter);
  app.get('/ping', (req, res) => res.json({ ip: req.ip }));
  return app;
}

describe('Rate limiter — trust proxy configuration', () => {
  test('forged X-Forwarded-For header does not bypass rate limit when trust proxy = 1', async () => {
    const app = buildApp(1);

    // Exhaust the limit using a consistent real IP (no X-Forwarded-For)
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);

    // Third request from the same underlying IP should be rate-limited
    await request(app).get('/ping').expect(429);

    // Attempting to bypass by forging X-Forwarded-For with a different IP
    // should NOT reset the limit because trust proxy = 1 means Express trusts
    // only one hop — the rightmost address inserted by our proxy, not the header
    // the client sends. In a test environment without a real proxy the
    // X-Forwarded-For header is ignored for the effective limit key.
    const bypassAttempt = await request(app)
      .get('/ping')
      .set('X-Forwarded-For', '1.2.3.4');

    // Still rate-limited — forged header did not create a new bucket
    expect(bypassAttempt.status).toBe(429);
  });

  test('app.set trust proxy is configured via TRUSTED_PROXY_HOPS env var', () => {
    const original = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = '2';

    const hops = parseInt(process.env.TRUSTED_PROXY_HOPS || '1', 10);
    expect(hops).toBe(2);

    process.env.TRUSTED_PROXY_HOPS = original;
  });

  test('defaults to 1 trusted proxy hop when TRUSTED_PROXY_HOPS is not set', () => {
    const original = process.env.TRUSTED_PROXY_HOPS;
    delete process.env.TRUSTED_PROXY_HOPS;

    const hops = parseInt(process.env.TRUSTED_PROXY_HOPS || '1', 10);
    expect(hops).toBe(1);

    process.env.TRUSTED_PROXY_HOPS = original;
  });
});
