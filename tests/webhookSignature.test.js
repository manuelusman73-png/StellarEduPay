'use strict';

// #468 — webhook HMAC-SHA256 signature
// Tests generateSignature, verifySignature, and fireWebhook directly.

const crypto = require('crypto');

// Mock the webhookRetryModel before requiring the service
jest.mock('../backend/src/models/webhookRetryModel', () => ({
  create: jest.fn().mockResolvedValue({}),
  find: jest.fn().mockResolvedValue([]),
  updateOne: jest.fn().mockResolvedValue({}),
}));

// Provide a controllable axios mock at the top level (hoisted by Jest)
const mockAxiosPost = jest.fn().mockResolvedValue({ status: 200 });
jest.mock('axios', () => ({ post: mockAxiosPost }), { virtual: true });

// ─── Load service after mocks ─────────────────────────────────────────────────

const { generateSignature, verifySignature, fireWebhook } = require('../backend/src/services/webhookService');
const WebhookRetry = require('../backend/src/models/webhookRetryModel');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('#468 webhook HMAC signature', () => {
  const SECRET = 'test-webhook-secret-abc123';
  const URL = 'https://example.com/webhook';
  const EVENT = 'payment.confirmed';
  const PAYLOAD = { studentId: 'STU001', amount: 100 };

  beforeEach(() => {
    mockAxiosPost.mockClear();
    mockAxiosPost.mockResolvedValue({ status: 200 });
    WebhookRetry.create.mockClear();
  });

  describe('generateSignature', () => {
    it('produces a hex string', () => {
      const sig = generateSignature({ event: EVENT, data: PAYLOAD }, SECRET);
      expect(typeof sig).toBe('string');
      expect(sig).toMatch(/^[0-9a-f]+$/);
    });

    it('changes when payload changes', () => {
      const body = { event: EVENT, data: PAYLOAD };
      const sig1 = generateSignature(body, SECRET);
      const sig2 = generateSignature({ ...body, data: { ...PAYLOAD, amount: 999 } }, SECRET);
      expect(sig1).not.toBe(sig2);
    });

    it('changes when secret changes', () => {
      const body = { event: EVENT, data: PAYLOAD };
      const sig1 = generateSignature(body, SECRET);
      const sig2 = generateSignature(body, 'different-secret');
      expect(sig1).not.toBe(sig2);
    });

    it('matches manual HMAC-SHA256 computation', () => {
      const body = { event: EVENT, data: PAYLOAD };
      const expected = crypto.createHmac('sha256', SECRET).update(JSON.stringify(body)).digest('hex');
      expect(generateSignature(body, SECRET)).toBe(expected);
    });
  });

  describe('verifySignature', () => {
    it('returns true for a valid signature', () => {
      const body = { event: EVENT, data: PAYLOAD };
      const sig = generateSignature(body, SECRET);
      expect(verifySignature(body, sig, SECRET)).toBe(true);
    });

    it('returns false for a tampered payload', () => {
      const body = { event: EVENT, data: PAYLOAD };
      const sig = generateSignature(body, SECRET);
      const tampered = { ...body, data: { ...PAYLOAD, amount: 0 } };
      expect(verifySignature(tampered, sig, SECRET)).toBe(false);
    });
  });

  describe('fireWebhook', () => {
    it('includes X-StellarEduPay-Signature header when secret is provided', async () => {
      await fireWebhook(URL, EVENT, PAYLOAD, SECRET);

      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      const [, body, config] = mockAxiosPost.mock.calls[0];

      expect(config.headers).toHaveProperty('X-StellarEduPay-Signature');
      const headerValue = config.headers['X-StellarEduPay-Signature'];
      expect(headerValue).toMatch(/^sha256=[0-9a-f]+$/);

      // Verify the signature is correct
      const expectedSig = `sha256=${generateSignature(body, SECRET)}`;
      expect(headerValue).toBe(expectedSig);
    });

    it('omits X-StellarEduPay-Signature header when no secret is provided', async () => {
      await fireWebhook(URL, EVENT, PAYLOAD);

      const [, , config] = mockAxiosPost.mock.calls[0];
      expect(config.headers).not.toHaveProperty('X-StellarEduPay-Signature');
    });

    it('returns success when webhook responds 2xx', async () => {
      const result = await fireWebhook(URL, EVENT, PAYLOAD, SECRET);
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('queues for retry on failure and stores secret', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await fireWebhook(URL, EVENT, PAYLOAD, SECRET);

      expect(result.success).toBe(false);
      expect(result.queued).toBe(true);
      // Secret should be stored in the retry record so re-delivery can be signed
      expect(WebhookRetry.create).toHaveBeenCalledWith(
        expect.objectContaining({ secret: SECRET }),
      );
    });
  });
});
