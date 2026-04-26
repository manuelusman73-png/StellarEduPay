'use strict';

/**
 * Tests for Issue #405 — CORS origin validation.
 *
 * parseAllowedOrigins() reads process.env at call time, so we set env vars
 * before each call and restore them after.
 */

// Load the function once — it has no module-level side effects
const { parseAllowedOrigins } = require('../backend/src/utils/corsOrigins');

// Helper: call parseAllowedOrigins with specific env vars, then restore
function parse(envOverrides = {}) {
  const saved = {};
  for (const [k, v] of Object.entries(envOverrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  let result, error;
  try {
    result = parseAllowedOrigins();
  } catch (e) {
    error = e;
  }
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  if (error) throw error;
  return result;
}

describe('Issue #405 — CORS origin validation', () => {
  // ── Valid configurations ──────────────────────────────────────────────────

  test('single valid origin — returns the origin string', () => {
    const result = parse({ NODE_ENV: 'development', ALLOWED_ORIGIN: 'https://app.school.com' });
    expect(result).toBe('https://app.school.com');
  });

  test('multiple comma-separated valid origins — returns an array', () => {
    const result = parse({
      NODE_ENV: 'development',
      ALLOWED_ORIGIN: 'https://app.school.com,https://admin.school.com',
    });
    expect(result).toEqual(['https://app.school.com', 'https://admin.school.com']);
  });

  test('wildcard (*) is allowed in development — returns "*"', () => {
    const result = parse({ NODE_ENV: 'development', ALLOWED_ORIGIN: '*' });
    expect(result).toBe('*');
  });

  test('missing ALLOWED_ORIGIN falls back to http://localhost:3000', () => {
    const result = parse({ NODE_ENV: 'development', ALLOWED_ORIGIN: undefined });
    expect(result).toBe('http://localhost:3000');
  });

  test('origin with surrounding whitespace is trimmed and accepted', () => {
    const result = parse({
      NODE_ENV: 'development',
      ALLOWED_ORIGIN: '  https://app.school.com  ,  https://admin.school.com  ',
    });
    expect(result).toEqual(['https://app.school.com', 'https://admin.school.com']);
  });

  // ── Production security ───────────────────────────────────────────────────

  test('wildcard (*) is rejected in production', () => {
    expect(() =>
      parse({ NODE_ENV: 'production', ALLOWED_ORIGIN: '*' })
    ).toThrow(/wildcard.*not permitted in production/i);
  });

  // ── Invalid URL rejection ─────────────────────────────────────────────────

  test('invalid URL causes a descriptive error', () => {
    expect(() =>
      parse({ NODE_ENV: 'development', ALLOWED_ORIGIN: 'not-a-valid-url' })
    ).toThrow(/invalid URL/i);
  });

  test('one invalid URL in a comma-separated list causes a descriptive error', () => {
    expect(() =>
      parse({ NODE_ENV: 'development', ALLOWED_ORIGIN: 'https://app.school.com,bad-url' })
    ).toThrow(/invalid URL/i);
  });
});
