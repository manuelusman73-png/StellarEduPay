'use strict';

jest.mock('../backend/src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { logger } = require('../backend/src/utils/logger');
const { requestLogger, redact } = require('../backend/src/middleware/requestLogger');

function makeReq(overrides = {}) {
  return {
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    method: 'POST',
    originalUrl: '/api/payments/verify',
    body: {},
    query: {},
    ...overrides,
  };
}

function makeRes() {
  const listeners = {};
  return {
    on: (event, cb) => { listeners[event] = cb; },
    statusCode: 200,
    _emit: (event) => listeners[event] && listeners[event](),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.LOG_REDACT_FIELDS;
});

describe('redact()', () => {
  test('redacts default sensitive fields', () => {
    const result = redact({ txHash: 'abc123', studentId: 'STU001', memo: 'STU001', senderAddress: 'GABC', amount: 250 });
    expect(result.txHash).toBe('[REDACTED]');
    expect(result.studentId).toBe('[REDACTED]');
    expect(result.memo).toBe('[REDACTED]');
    expect(result.senderAddress).toBe('[REDACTED]');
    expect(result.amount).toBe(250);
  });

  test('does not mutate the original object', () => {
    const original = { txHash: 'abc', amount: 100 };
    redact(original);
    expect(original.txHash).toBe('abc');
  });

  test('returns non-objects unchanged', () => {
    expect(redact(null)).toBeNull();
    expect(redact('string')).toBe('string');
    expect(redact(42)).toBe(42);
  });

  test('respects LOG_REDACT_FIELDS env var', () => {
    process.env.LOG_REDACT_FIELDS = 'customField,anotherField';
    const result = redact({ customField: 'secret', txHash: 'visible', anotherField: 'hidden' });
    expect(result.customField).toBe('[REDACTED]');
    expect(result.anotherField).toBe('[REDACTED]');
    expect(result.txHash).toBe('visible');
  });
});

describe('requestLogger middleware', () => {
  test('logs incoming request without body/query when empty', () => {
    const req = makeReq();
    const res = makeRes();
    requestLogger()(req, res, () => {});

    const [, loggedData] = logger.info.mock.calls[0];
    expect(loggedData).not.toHaveProperty('body');
    expect(loggedData).not.toHaveProperty('query');
  });

  test('logs redacted body — sensitive fields replaced with [REDACTED]', () => {
    const req = makeReq({ body: { txHash: 'abc123', studentId: 'STU001', amount: 250 } });
    const res = makeRes();
    requestLogger()(req, res, () => {});

    const [, loggedData] = logger.info.mock.calls[0];
    expect(loggedData.body.txHash).toBe('[REDACTED]');
    expect(loggedData.body.studentId).toBe('[REDACTED]');
    expect(loggedData.body.amount).toBe(250);
  });

  test('logs redacted query params — sensitive fields replaced with [REDACTED]', () => {
    const req = makeReq({ query: { memo: 'STU001', page: '1' } });
    const res = makeRes();
    requestLogger()(req, res, () => {});

    const [, loggedData] = logger.info.mock.calls[0];
    expect(loggedData.query.memo).toBe('[REDACTED]');
    expect(loggedData.query.page).toBe('1');
  });

  test('sensitive fields are not present in raw form in any log call', () => {
    const req = makeReq({
      body: { txHash: 'real-hash', studentId: 'STU999', senderAddress: 'GABC', memo: 'STU999' },
      query: { studentId: 'STU999' },
    });
    const res = makeRes();
    requestLogger()(req, res, () => {});
    res._emit('finish');

    const allLoggedStrings = logger.info.mock.calls
      .concat(logger.warn.mock.calls, logger.error.mock.calls)
      .map((args) => JSON.stringify(args));

    for (const entry of allLoggedStrings) {
      expect(entry).not.toContain('real-hash');
      expect(entry).not.toContain('STU999');
      expect(entry).not.toContain('GABC');
    }
  });

  test('attaches requestId to req', () => {
    const req = makeReq();
    const res = makeRes();
    requestLogger()(req, res, () => {});
    expect(req.requestId).toBeDefined();
  });

  test('logs completion on res finish', () => {
    const req = makeReq();
    const res = makeRes();
    requestLogger()(req, res, () => {});
    res._emit('finish');
    expect(logger.info).toHaveBeenCalledTimes(2);
  });
});
