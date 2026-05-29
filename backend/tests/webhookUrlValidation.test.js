'use strict';

jest.mock('dns', () => ({
  promises: {
    resolve4: jest.fn(),
    resolve6: jest.fn(),
  },
}));

const dns = require('dns').promises;
const { validateWebhookUrl, isPrivateIPv4 } = require('../src/utils/validateWebhookUrl');

function mockDns(v4 = [], v6 = []) {
  dns.resolve4.mockResolvedValue(v4);
  dns.resolve6.mockResolvedValue(v6);
}

beforeEach(() => jest.clearAllMocks());

describe('validateWebhookUrl — protocol enforcement', () => {
  test('rejects http:// URLs', async () => {
    mockDns(['93.184.216.34']);
    const result = await validateWebhookUrl('http://example.com/hook');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('INVALID_WEBHOOK_URL');
  });

  test('rejects non-URL strings', async () => {
    const result = await validateWebhookUrl('not-a-url');
    expect(result.valid).toBe(false);
  });

  test('accepts https:// URL resolving to a public IP', async () => {
    mockDns(['93.184.216.34']);
    const result = await validateWebhookUrl('https://example.com/hook');
    expect(result.valid).toBe(true);
  });
});

describe('validateWebhookUrl — localhost and reserved hostnames', () => {
  test('rejects localhost', async () => {
    const result = await validateWebhookUrl('https://localhost/hook');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('INVALID_WEBHOOK_URL');
  });

  test('rejects .local hostnames', async () => {
    const result = await validateWebhookUrl('https://mongo.local/hook');
    expect(result.valid).toBe(false);
  });

  test('rejects .internal hostnames', async () => {
    const result = await validateWebhookUrl('https://redis.internal/hook');
    expect(result.valid).toBe(false);
  });
});

describe('validateWebhookUrl — RFC 1918 and link-local IP literals', () => {
  test('rejects 127.0.0.1 (loopback)', async () => {
    const result = await validateWebhookUrl('https://127.0.0.1/hook');
    expect(result.valid).toBe(false);
  });

  test('rejects 10.0.0.1 (RFC 1918 Class A)', async () => {
    const result = await validateWebhookUrl('https://10.0.0.1/hook');
    expect(result.valid).toBe(false);
  });

  test('rejects 172.16.0.1 (RFC 1918 Class B)', async () => {
    const result = await validateWebhookUrl('https://172.16.0.1/hook');
    expect(result.valid).toBe(false);
  });

  test('rejects 192.168.1.1 (RFC 1918 Class C)', async () => {
    const result = await validateWebhookUrl('https://192.168.1.1/hook');
    expect(result.valid).toBe(false);
  });

  test('rejects 169.254.169.254 (AWS metadata / link-local)', async () => {
    const result = await validateWebhookUrl('https://169.254.169.254/hook');
    expect(result.valid).toBe(false);
  });
});

describe('validateWebhookUrl — DNS resolution checks', () => {
  test('rejects hostname resolving to RFC 1918 address', async () => {
    mockDns(['192.168.100.5']);
    const result = await validateWebhookUrl('https://internal-service.example.com/hook');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('INVALID_WEBHOOK_URL');
  });

  test('rejects hostname resolving to 10.x.x.x', async () => {
    mockDns(['10.20.30.40']);
    const result = await validateWebhookUrl('https://evil.example.com/hook');
    expect(result.valid).toBe(false);
  });

  test('rejects when DNS returns no addresses', async () => {
    mockDns([], []);
    const result = await validateWebhookUrl('https://nonexistent.example.com/hook');
    expect(result.valid).toBe(false);
  });

  test('accepts hostname resolving to a public IP', async () => {
    mockDns(['93.184.216.34']);
    const result = await validateWebhookUrl('https://example.com/hook');
    expect(result.valid).toBe(true);
  });
});

describe('isPrivateIPv4 helper', () => {
  test.each([
    ['127.0.0.1', true],
    ['10.0.0.1', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.0.1', true],
    ['169.254.1.1', true],
    ['8.8.8.8', false],
    ['93.184.216.34', false],
    ['1.1.1.1', false],
  ])('%s → private: %s', (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected);
  });
});
