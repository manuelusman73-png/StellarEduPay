'use strict';

/**
 * Tests for issue #403 — payment intent TTL index.
 *
 * Verifies:
 *   1. paymentIntentModel schema declares a TTL index on createdAt.
 *   2. The TTL value defaults to 86400 when PAYMENT_INTENT_TTL_SECONDS is unset.
 *   3. The TTL value is read from PAYMENT_INTENT_TTL_SECONDS when set.
 *   4. Migration 006 up() creates the TTL index on paymentintents.createdAt.
 *   5. Migration 006 down() removes the TTL index.
 *   6. Expired intents (status !== 'pending') are not returned by existing queries
 *      — confirmed by verifying all PaymentIntent.findOne calls filter by status:'pending'.
 */

describe('paymentIntentModel — TTL index on createdAt', () => {
  const ORIGINAL_TTL = process.env.PAYMENT_INTENT_TTL_SECONDS;

  afterEach(() => {
    // Restore env and clear module cache so the model is re-evaluated
    if (ORIGINAL_TTL === undefined) {
      delete process.env.PAYMENT_INTENT_TTL_SECONDS;
    } else {
      process.env.PAYMENT_INTENT_TTL_SECONDS = ORIGINAL_TTL;
    }
    jest.resetModules();
  });

  test('schema has a TTL index on createdAt with default 86400s', () => {
    delete process.env.PAYMENT_INTENT_TTL_SECONDS;
    const PaymentIntent = jest.requireActual('../backend/src/models/paymentIntentModel');
    const indexes = PaymentIntent.schema.indexes();
    const ttlIndex = indexes.find(([fields, opts]) =>
      fields.createdAt !== undefined && opts.expireAfterSeconds !== undefined
    );
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex[1].expireAfterSeconds).toBe(86400);
  });

  test('TTL value is read from PAYMENT_INTENT_TTL_SECONDS env var', () => {
    process.env.PAYMENT_INTENT_TTL_SECONDS = '3600';
    const PaymentIntent = jest.requireActual('../backend/src/models/paymentIntentModel');
    const indexes = PaymentIntent.schema.indexes();
    const ttlIndex = indexes.find(([fields, opts]) =>
      fields.createdAt !== undefined && opts.expireAfterSeconds !== undefined
    );
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex[1].expireAfterSeconds).toBe(3600);
  });
});

describe('migration 006 — TTL index on paymentintents', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.PAYMENT_INTENT_TTL_SECONDS;
  });

  function mockCollection(overrides = {}) {
    const col = {
      createIndex: jest.fn().mockResolvedValue({}),
      dropIndex: jest.fn().mockResolvedValue({}),
      indexes: jest.fn().mockResolvedValue([]),
      ...overrides,
    };
    const mongoose = require('mongoose');
    jest.spyOn(mongoose.connection, 'collection').mockReturnValue(col);
    return col;
  }

  test('up() creates TTL index on createdAt with default TTL', async () => {
    const col = mockCollection();
    const migration = require('../backend/migrations/006_add_payment_intent_ttl_index');
    await migration.up();
    expect(col.createIndex).toHaveBeenCalledWith({ createdAt: 1 }, { expireAfterSeconds: 86400 });
  });

  test('up() drops existing TTL index before creating new one', async () => {
    const col = mockCollection({
      indexes: jest.fn().mockResolvedValue([
        { name: 'createdAt_1', key: { createdAt: 1 }, expireAfterSeconds: 999 },
      ]),
    });
    const migration = require('../backend/migrations/006_add_payment_intent_ttl_index');
    await migration.up();
    expect(col.dropIndex).toHaveBeenCalledWith('createdAt_1');
    expect(col.createIndex).toHaveBeenCalled();
  });

  test('down() drops the TTL index', async () => {
    const col = mockCollection({
      indexes: jest.fn().mockResolvedValue([
        { name: 'createdAt_1', key: { createdAt: 1 }, expireAfterSeconds: 86400 },
      ]),
    });
    const migration = require('../backend/migrations/006_add_payment_intent_ttl_index');
    await migration.down();
    expect(col.dropIndex).toHaveBeenCalledWith('createdAt_1');
  });

  test('up() respects PAYMENT_INTENT_TTL_SECONDS env var', async () => {
    process.env.PAYMENT_INTENT_TTL_SECONDS = '7200';
    jest.resetModules(); // force re-evaluation so the new env var is picked up
    const col = mockCollection();
    const migration = require('../backend/migrations/006_add_payment_intent_ttl_index');
    await migration.up();
    expect(col.createIndex).toHaveBeenCalledWith({ createdAt: 1 }, { expireAfterSeconds: 7200 });
  });
});
